import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { request as httpRequest } from "node:http";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LockStatusResponseSchema, SetupResponseSchema, UnlockResponseSchema, LockResponseSchema, ApiErrorResponseSchema } from "@innercove/core";
import { buildApp } from "../app.js";
import { FakeProvider, type InferenceProvider } from "../inference/index.js";
import { noSafety } from "../chat/safety.js";
import { DatabaseStore } from "../store/db.js";

const PASSWORD = "test-only-PASSPHRASE-CANARY";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function fixture({ provider = new FakeProvider({ reply: ["Hello."] }), staticFiles = false, now }: {
  provider?: InferenceProvider; staticFiles?: boolean; now?: () => number;
} = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-lock-api-"));
  const database = new DatabaseStore(path.join(dir, "data", "test.db"), now);
  const logs: string[] = [];
  const stream = new Writable({ write(chunk, _encoding, callback) { logs.push(String(chunk)); callback(); } });
  const webDist = path.join(dir, "web");
  if (staticFiles) {
    mkdirSync(webDist); writeFileSync(path.join(webDist, "index.html"), "<html>Static crisis help</html>");
  }
  const app = await buildApp({ database, provider, safety: noSafety, systemPrompt: "SYSTEM", stats: { lastReply: null },
    ...(staticFiles ? { webDist } : {}),
  }, { level: "info", stream });
  cleanups.push(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  return { app, database, logs };
}

describe("database lifecycle HTTP contract", () => {
  it("starts locked; setup, lock, reopen and status use the agreed response schemas", async () => {
    const { app, database } = await fixture();
    let status = await app.inject({ method: "GET", url: "/api/lock-status" });
    expect(LockStatusResponseSchema.parse(status.json())).toEqual({ hasPassphrase: false, locked: true });
    expect((await app.inject({ method: "GET", url: "/api/health" })).json().locked).toBe(true);
    const setup = await app.inject({ method: "POST", url: "/api/setup", payload: { passphrase: PASSWORD } });
    expect(setup.statusCode).toBe(201); expect(SetupResponseSchema.parse(setup.json())).toEqual({ locked: false });
    const active = database.acquire(); active.release();
    const lock = await app.inject({ method: "POST", url: "/api/lock" });
    expect(LockResponseSchema.parse(lock.json())).toEqual({ locked: true });
    expect(active.db.open).toBe(false);
    status = await app.inject({ method: "GET", url: "/api/lock-status" });
    expect(status.json()).toEqual({ hasPassphrase: true, locked: true });
    const unlock = await app.inject({ method: "POST", url: "/api/unlock", payload: { passphrase: PASSWORD } });
    expect(unlock.statusCode).toBe(200); expect(UnlockResponseSchema.parse(unlock.json())).toEqual({ locked: false });
    expect((await app.inject({ method: "GET", url: "/api/health" })).json().locked).toBe(false);
  });

  it("allows only the specified method/route pairs while locked, including unknown API routes", async () => {
    const { app } = await fixture();
    for (const [method, url] of [
      ["GET", "/api/conversations"], ["POST", "/api/chat"], ["POST", "/api/infer"], ["POST", "/api/lock"],
      ["GET", "/api/setup"], ["GET", "/api/unlock"], ["POST", "/api/health"], ["POST", "/api/lock-status"],
      ["DELETE", "/api/health"], ["HEAD", "/api/health"], ["HEAD", "/api/lock-status"],
      ["OPTIONS", "/api/unlock"], ["GET", "/api/health/extra"], ["GET", "/api/unknown?foo=1"],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode, `${method} ${url}`).toBe(423);
      if (method !== "HEAD") expect(ApiErrorResponseSchema.parse(res.json()).error.code).toBe("LOCKED");
    }
    expect((await app.inject({ method: "GET", url: "/api/health?check=1" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/setup", payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/unlock", payload: {} })).statusCode).toBe(400);
  });

  it("keeps static pages and crisis help accessible while locked", async () => {
    const { app } = await fixture({ staticFiles: true });
    for (const url of ["/", "/help"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(200); expect(res.body).toContain("Static crisis help");
    }
    expect((await app.inject({ method: "GET", url: "/api/unknown" })).statusCode).toBe(423);
  });

  it("streams A's infer route when unlocked without writing application content", async () => {
    const { app, database } = await fixture(); await database.setup(PASSWORD);
    const lease = database.acquire();
    const count = () => ["conversations", "messages", "diary_entries", "memories", "provenance", "message_context", "tombstones"]
      .map((table) => lease.db.prepare(`SELECT count(*) n FROM ${table} WHERE user_id=?`).get(lease.userId));
    const before = count();
    const res = await app.inject({ method: "POST", url: "/api/infer", payload: { history: [], message: "hello" } });
    expect(res.statusCode).toBe(200); expect(res.headers["content-type"]).toMatch(/^text\/event-stream/);
    expect(res.body).toContain("event: done"); expect(count()).toEqual(before);
    lease.release();
    expect((await app.inject({ method: "GET", url: "/api/unknown" })).statusCode).toBe(404);
    await app.inject({ method: "POST", url: "/api/lock" });
    expect(lease.db.open).toBe(false);
  });

  it("rejects invalid or extra lifecycle fields and never exposes credentials or query values in logs", async () => {
    const { app, logs } = await fixture();
    for (const payload of [{ passphrase: "short" }, { passphrase: PASSWORD, extra: "SECRET_CONTENT" }, { passphrase: 42 }]) {
      const res = await app.inject({ method: "POST", url: "/api/setup", payload });
      expect(res.statusCode).toBe(400); expect(res.body).not.toContain(PASSWORD); expect(res.body).not.toContain("SECRET_CONTENT");
    }
    await app.inject({ method: "POST", url: "/api/setup?passphrase=QUERY_SECRET", payload: { passphrase: PASSWORD } });
    await app.inject({ method: "POST", url: "/api/lock" });
    const bad = await app.inject({ method: "POST", url: "/api/unlock", payload: { passphrase: "WRONG_SECRET" } });
    expect(bad.statusCode).toBe(401); expect(bad.json().error.code).toBe("UNAUTHORIZED");
    expect(bad.body).not.toContain("WRONG_SECRET");
    const log = logs.join(""); expect(log.length).toBeGreaterThan(0);
    for (const canary of [PASSWORD, "SECRET_CONTENT", "QUERY_SECRET", "WRONG_SECRET"]) expect(log).not.toContain(canary);
  });

  it("protects existing setup and serializes concurrent setup requests", async () => {
    const { app } = await fixture();
    const results = await Promise.all([1, 2].map(() => app.inject({ method: "POST", url: "/api/setup", payload: { passphrase: PASSWORD } })));
    expect(results.map((res) => res.statusCode).sort()).toEqual([201, 409]);
    await app.inject({ method: "POST", url: "/api/lock" });
    expect((await app.inject({ method: "POST", url: "/api/setup", payload: { passphrase: "other-passphrase" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/api/unlock", payload: { passphrase: PASSWORD } })).statusCode).toBe(200);
  });

  it("returns the contracted 30-second unlock cooldown with Retry-After", async () => {
    let now = 1000;
    const { app, database } = await fixture({ now: () => now }); await database.setup(PASSWORD); await database.lock();
    let res;
    for (let i = 0; i < 5; i++) res = await app.inject({ method: "POST", url: "/api/unlock", payload: { passphrase: "incorrect" } });
    expect(res!.statusCode).toBe(401); expect(res!.headers["retry-after"]).toBe("30");
    expect((await app.inject({ method: "POST", url: "/api/unlock", payload: { passphrase: PASSWORD } })).statusCode).toBe(401);
    now += 30000;
    expect((await app.inject({ method: "POST", url: "/api/unlock", payload: { passphrase: PASSWORD } })).statusCode).toBe(200);
  });

  it("rejects lock payloads; repeated unlock validates credentials and repeated lock is 423", async () => {
    const { app, database } = await fixture(); await database.setup(PASSWORD);
    expect((await app.inject({ method: "POST", url: "/api/lock", payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/unlock", payload: { passphrase: PASSWORD } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/unlock", payload: { passphrase: "wrong" } })).statusCode).toBe(401);
    expect(database.locked).toBe(false);
    expect((await app.inject({ method: "POST", url: "/api/lock" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/lock" })).statusCode).toBe(423);
  });

  it("waits for an admitted database request before closing while immediately blocking new requests", async () => {
    const { app, database } = await fixture(); await database.setup(PASSWORD);
    let enter!: () => void; let resume!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const resumed = new Promise<void>((resolve) => { resume = resolve; });
    let native: import("better-sqlite3-multiple-ciphers").Database | undefined;
    app.get("/api/test-active", async (request) => {
      const lease = request.databaseLease!; native = lease.db; enter(); await resumed;
      return lease.db.prepare("SELECT user_id FROM settings WHERE user_id=?").get(lease.userId);
    });
    const active = app.inject({ method: "GET", url: "/api/test-active" }); await entered;
    const lock = app.inject({ method: "POST", url: "/api/lock" });
    try {
      await vi.waitFor(() => expect(database.locked).toBe(true));
      expect(native!.open).toBe(true);
      expect((await app.inject({ method: "GET", url: "/api/test-active" })).statusCode).toBe(423);
    } finally { resume(); }
    expect((await active).statusCode).toBe(200); expect((await lock).statusCode).toBe(200);
    expect(native!.open).toBe(false);
  });

  it("drains A's active hijacked SSE stream safely during lock", async () => {
    let enter!: () => void; let resume!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const resumed = new Promise<void>((resolve) => { resume = resolve; });
    const provider: InferenceProvider = {
      modelId: "fake", health: async () => ({ modelId: "fake", reachable: true }),
      async *streamChat() { yield { type: "text" as const, text: "Hello " }; enter(); await resumed; yield { type: "text" as const, text: "there." }; },
    };
    const { app, database } = await fixture({ provider }); await database.setup(PASSWORD);
    const native = database.acquire(); native.release();
    const active = app.inject({ method: "POST", url: "/api/infer", payload: { history: [], message: "hello" } }); await entered;
    const lock = app.inject({ method: "POST", url: "/api/lock" });
    try {
      await vi.waitFor(() => expect(database.locked).toBe(true));
      expect(native.db.open).toBe(true);
    } finally { resume(); }
    const response = await active;
    expect(response.body).toContain("event: done"); expect(response.body).toContain("Hello there.");
    expect((await lock).statusCode).toBe(200);
    expect(native.db.open).toBe(false);
  });

  it("retains an active handler's lease after client disconnect until its work settles", async () => {
    const { app, database } = await fixture(); await database.setup(PASSWORD);
    let enter!: () => void; let resume!: () => void; let done!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const resumed = new Promise<void>((resolve) => { resume = resolve; });
    const finished = new Promise<void>((resolve) => { done = resolve; });
    let native: import("better-sqlite3-multiple-ciphers").Database | undefined;
    let readSucceeded = false;
    app.get("/api/test-disconnect", async (request) => {
      const lease = request.databaseLease!; native = lease.db; enter(); await resumed;
      try { readSucceeded = !!lease.db.prepare("SELECT user_id FROM settings WHERE user_id=?").get(lease.userId); }
      finally { done(); }
      return { ok: true };
    });
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const client = httpRequest(`${address}/api/test-disconnect`);
    client.on("error", () => {}); client.end(); await entered;
    const lock = app.inject({ method: "POST", url: "/api/lock" });
    try {
      await vi.waitFor(() => expect(database.locked).toBe(true));
      const closed = new Promise<void>((resolve) => client.once("close", resolve));
      client.destroy(); await closed;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(native!.open).toBe(true);
    } finally { resume(); }
    await finished; expect((await lock).statusCode).toBe(200);
    expect(readSucceeded).toBe(true); expect(native!.open).toBe(false);
  });

  it("closes the database on Fastify shutdown", async () => {
    const { app, database } = await fixture(); await database.setup(PASSWORD);
    const connection = database.acquire(); connection.release();
    await app.close(); expect(connection.db.open).toBe(false); expect(database.locked).toBe(true);
    await expect(database.unlock(PASSWORD)).rejects.toMatchObject({ code: "LOCKED" });
  });
});
