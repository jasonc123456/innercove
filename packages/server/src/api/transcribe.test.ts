import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { Writable } from "node:stream";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TRANSCRIPTION_MAX_BYTES } from "@innercove/core";
import { databaseRoutes } from "./lock.js";
import { transcriptionRoutes } from "./transcribe.js";
import { inspectPcm, runLocal, TranscriptionError, WhisperTranscriber, type Transcriber } from "./transcribe-runtime.js";
import { DatabaseStore } from "../store/db.js";
import { buildApp } from "../app.js";
import { FakeProvider } from "../inference/fake.js";
import { noSafety } from "../chat/safety.js";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const f of cleanup.splice(0)) await f(); vi.restoreAllMocks(); });
const canary = "FICTIONALTRANSCRIPTCANARY";
const success: Transcriber = { async transcribe() { return { text: canary, durationMs: 1500 }; } };
async function fixture(adapter = success, timeout = 200, uploadTimeout = 1000) {
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-stt-api-"));
  const database = new DatabaseStore(path.join(dir, "fixture.db")); await database.setup("fictional-stt-secret");
  const logs: string[] = [];
  const app = Fastify({ logger: { level: "info", stream: new Writable({ write(chunk, _encoding, callback) { logs.push(String(chunk)); callback(); } }) } });
  databaseRoutes(app, database); transcriptionRoutes(app, adapter, timeout, uploadTimeout, () => true);
  app.setErrorHandler((_error, _request, reply) => reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid upload" } }));
  cleanup.push(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  const post = (payload = Buffer.from("fictional encoded audio"), type = "audio/webm;codecs=opus", url = "/api/transcribe") => app.inject({ method: "POST", url, headers: { "content-type": type }, payload });
  return { app, database, logs, post };
}
function snapshot(database: DatabaseStore) {
  const lease = database.acquire();
  try { return lease.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => {
    const name = (row as { name: string }).name;
    return [name, lease.db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()];
  }); } finally { lease.release(); }
}

describe("bounded local draft transcription API", () => {
  it("uses the actual production registration and existing locked gate; no runtime is required at startup", async () => {
    const { database } = await fixture();
    const app = await buildApp({ database, provider: new FakeProvider(), safety: noSafety, systemPrompt: "fixture", stats: { lastReply: null } }, false);
    cleanup.unshift(async () => { await app.close(); });
    const unavailable = await app.inject({ method: "POST", url: "/api/transcribe", headers: { "content-type": "audio/wav" }, payload: Buffer.from("fixture") });
    expect(unavailable.statusCode).toBe(401);
    const signIn = await app.inject({ method: "POST", url: "/api/session", payload: { login: "admin", passphrase: "fictional-stt-secret" } });
    expect(signIn.statusCode).toBe(200);
    const cookie = String(signIn.headers["set-cookie"]).split(";")[0]!;
    const headers = { cookie, "content-type": "audio/wav" };
    // Real D47 cookie reaches the route's shared validation; no test auth adapter.
    expect((await app.inject({ method: "POST", url: "/api/transcribe", headers, payload: Buffer.alloc(0) })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/transcribe", headers: { ...headers, origin: "https://untrusted.invalid" }, payload: Buffer.from("fixture") })).statusCode).toBe(403);
    await app.inject({ method: "DELETE", url: "/api/session", headers: { cookie } });
    expect((await app.inject({ method: "POST", url: "/api/transcribe", headers, payload: Buffer.from("fixture") })).statusCode).toBe(401);
    await database.lock();
    // Existing locked-store gate remains 423; unlocked requests require the real session.
    expect((await app.inject({ method: "POST", url: "/api/transcribe", headers: { "content-type": "audio/wav" }, payload: Buffer.from("fixture") })).statusCode).toBe(423);
  });
  it("returns an editable draft without changing any encrypted table or logging audio/text", async () => {
    const { database, logs, post } = await fixture(); const before = snapshot(database);
    expect((await post(Buffer.from(canary))).json()).toEqual({ text: canary, durationMs: 1500 });
    expect(snapshot(database)).toEqual(before); expect(logs.join("")).not.toContain(canary);
  });
  it("rejects empty, unsupported, JSON, oversized and client-duration uploads before invoking inference", async () => {
    const transcribe = vi.fn(success.transcribe); const { post } = await fixture({ transcribe });
    for (const response of [await post(Buffer.alloc(0)), await post(Buffer.from("fixture"), "audio/mpeg"), await post(Buffer.from('{"duration":1}'), "application/json"), await post(Buffer.alloc(TRANSCRIPTION_MAX_BYTES + 1)), await post(Buffer.from("fixture"), "audio/wav", "/api/transcribe?duration=1")]) expect(response.statusCode).toBe(400);
    expect(transcribe).not.toHaveBeenCalled(); expect((await post()).statusCode).toBe(200);
  });
  it("fails content-free on adapter error, empty text and invalid measured duration", async () => {
    for (const adapter of [{ async transcribe() { throw new Error(canary); } }, { async transcribe() { return { text: "", durationMs: 1 }; } }, { async transcribe() { return { text: canary, durationMs: 60001 }; } }]) {
      const { post } = await fixture(adapter); const response = await post(); expect(response.statusCode).toBeGreaterThanOrEqual(400); expect(response.body).not.toContain(canary);
    }
  });
  it("enforces concurrency and a request deadline even when an adapter ignores abort; lock leases drain", async () => {
    let finish!: (result: { text: string; durationMs: number }) => void;
    const adapter: Transcriber = { transcribe: () => new Promise(resolve => { finish = resolve; }) };
    const { database, post } = await fixture(adapter, 40);
    const active = post().then(r => r); await vi.waitFor(() => expect(finish).toBeDefined());
    expect((await post()).statusCode).toBe(409);
    expect((await active).statusCode).toBe(503);
    const locking = database.lock(); await locking; expect(database.locked).toBe(true);
    finish({ text: canary, durationMs: 1000 });
  });
  it("cancels disconnected requests and times out incomplete uploads without stranded leases", async () => {
    let entered!: () => void; let cleaned = false;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const adapter: Transcriber = { transcribe: (_audio, _type, signal) => new Promise((_resolve, reject) => { entered(); signal.addEventListener("abort", () => { cleaned = true; reject(new Error(canary)); }, { once: true }); }) };
    const { app, database } = await fixture(adapter, 1000, 50);
    const base = await app.listen({ host: "127.0.0.1", port: 0 });
    const controller = new AbortController();
    const active = fetch(base + "/api/transcribe", { method: "POST", headers: { "content-type": "audio/wav" }, body: "fictional", signal: controller.signal }).catch(() => null);
    await started; controller.abort(); await active; await vi.waitFor(() => expect(cleaned).toBe(true));
    const pending = http.request(base + "/api/transcribe", { method: "POST", headers: { "content-type": "audio/wav", "content-length": "100" } });
    const closed = new Promise<void>(resolve => { pending.once("error", () => resolve()); pending.once("close", () => resolve()); });
    pending.write("x"); await closed;
    await database.lock(); expect(database.locked).toBe(true);
  });
  it("aborts active work on shutdown and releases leases without waiting for the normal deadline", async () => {
    let aborted = false;
    const adapter: Transcriber = { transcribe: (_audio, _type, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error(canary)); }, { once: true })) };
    const { app, post } = await fixture(adapter, 5000); const active = post().then(r => r);
    await new Promise(resolve => setTimeout(resolve, 20)); await app.close(); expect(aborted).toBe(true); expect((await active).statusCode).toBe(503);
  });
});

describe("RAM-only local process adapter", () => {
  it("measures samples rather than metadata and rejects silent/empty/overlong PCM", () => {
    for (const pcm of [Buffer.alloc(0), Buffer.alloc(32000), Buffer.alloc(1920002), Buffer.alloc(3)]) expect(() => inspectPcm(pcm)).toThrow();
    const pcm = Buffer.alloc(1920000); for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(1000, i);
    expect(inspectPcm(pcm)).toBe(60000);
  });
  it("bounds subprocess output, handles missing runtimes and kills a cancelled child", async () => {
    await expect(runLocal("/missing-fictional-runtime", [], new AbortController().signal, 10)).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
    await expect(runLocal(process.execPath, ["-e", "process.stdout.write('x'.repeat(100))"], new AbortController().signal, 10)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(runLocal(process.execPath, ["-e", "process.exit(1)"], new AbortController().signal, 10, () => new TranscriptionError("MODEL_UNAVAILABLE", "Local transcription unavailable"))).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
    const controller = new AbortController(); const running = runLocal(process.execPath, ["-e", "setInterval(()=>{},1000)"], controller.signal, 10);
    const assertion = expect(running).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" }); controller.abort(); await assertion;
  });
  it("cleans unique scratch after success, decode failure and cancellation; rejects disk scratch", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "innercove-stt-binaries-"));
    cleanup.push(async () => { rmSync(dir, { recursive: true, force: true }); });
    const model = path.join(dir, "model"); writeFileSync(model, "fictional model");
    const ffmpeg = path.join(dir, "decode"); const binary = path.join(dir, "whisper");
    const script = (file: string, body: string) => writeFileSync(file, `#!${process.execPath}\n${body}\n`, { mode: 0o700 });
    script(ffmpeg, "const b=Buffer.alloc(32000); for(let i=0;i<b.length;i+=2)b.writeInt16LE(1000,i);process.stdout.write(b)"); script(binary, `process.stdout.write('${canary}')`);
    const root = mkdtempSync("/dev/shm/innercove-stt-test-"); cleanup.push(async () => { rmSync(root, { recursive: true, force: true }); });
    const adapter = new WhisperTranscriber({ binary, model, ffmpeg, tempRoot: root });
    expect(await adapter.transcribe(Buffer.from("fixture"), "audio/wav", new AbortController().signal)).toEqual({ text: canary, durationMs: 1000 }); expect(readdirSync(root)).toEqual([]);
    script(ffmpeg, "process.exit(1)"); await expect(adapter.transcribe(Buffer.from("fixture"), "audio/wav", new AbortController().signal)).rejects.toThrow(); expect(readdirSync(root)).toEqual([]);
    script(ffmpeg, "setInterval(()=>{},1000)"); const controller = new AbortController(); const pending = adapter.transcribe(Buffer.from("fixture"), "audio/wav", controller.signal); const check = expect(pending).rejects.toThrow(); setTimeout(() => controller.abort(), 40); await check; expect(readdirSync(root)).toEqual([]);
    await expect(new WhisperTranscriber({ binary, model, ffmpeg, tempRoot: process.cwd() }).transcribe(Buffer.from("fixture"), "audio/wav", new AbortController().signal)).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  });
});
