import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseStore } from "./store/db.js";
import { FakeProvider, ModelUnavailableError, type InferenceProvider } from "./inference/index.js";
import { buildApp } from "./app.js";
import { noSafety } from "./chat/safety.js";
import { signedIn } from "./testing/signed-in.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const CANARY = "CANARY-7f3a9c";

function parseSse(body: string) {
  return body
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const name = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      return { name, data: data ? JSON.parse(data) : undefined };
    });
}

async function setup(provider: InferenceProvider = new FakeProvider({ reply: ["Hi ", "there."] })) {
  const logs: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      logs.push(String(chunk));
      cb();
    },
  });
  const stats = { lastReply: null };
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-app-"));
  const database = new DatabaseStore(path.join(dir, "test.db"));
  await database.setup("test-only-passphrase");
  const app = await buildApp({ sessionGuard: signedIn, database, provider, safety: noSafety, systemPrompt: "SYSTEM", stats }, { level: "info", stream });
  cleanups.push(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  return { app, logs, stats };
}

describe("GET /api/health", () => {
  it("reports the model and lock state", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.json()).toEqual({ status: "ok", locked: false, model: { id: "fake", reachable: true } });
  });
});

describe("POST /api/infer", () => {
  it("streams meta, context, sentence deltas and done in order", async () => {
    const provider = new FakeProvider({ reply: ["Hi ", "there. How ", "are you?"] });
    const { app, stats } = await setup(provider);
    const res = await app.inject({
      method: "POST",
      url: "/api/infer",
      payload: { history: [{ role: "user", content: "earlier" }, { role: "assistant", content: "reply" }], message: "a simple question" },
    });
    expect(res.headers["content-type"]).toMatch(/^text\/event-stream/);
    const events = parseSse(res.body);
    expect(events.map((e) => e.name)).toEqual(["meta", "context", "delta", "delta", "done"]);
    expect(events[2]!.data.text).toBe("Hi there. ");
    expect(events[0]!.data).toEqual({ conversationId: null, userMessageId: null, tier: 0 });
    expect(events.filter((e) => e.name === "delta").map((e) => e.data.text).join("")).toBe("Hi there. How are you?");
    expect(events.at(-1)!.data).toMatchObject({ assistantMessageId: null, modelId: "fake" });
    expect(provider.prompts[0]).toEqual([
      { role: "system", content: "SYSTEM" },
      { role: "user", content: "earlier" },
      { role: "assistant", content: "reply" },
      { role: "user", content: "a simple question" },
    ]);
    expect(stats.lastReply).not.toBeNull();
  });

  it("rejects unknown fields with VALIDATION_ERROR and does not echo input", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "POST", url: "/api/infer", payload: { history: [], message: CANARY, extra: 1 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    expect(res.body).not.toContain(CANARY);
  });

  it("sends MODEL_UNAVAILABLE as an SSE error event", async () => {
    const down: InferenceProvider = {
      modelId: "m",
      health: async () => ({ modelId: "m", reachable: false }),
      // eslint-disable-next-line require-yield
      async *streamChat() {
        throw new ModelUnavailableError("down");
      },
    };
    const { app } = await setup(down);
    const res = await app.inject({ method: "POST", url: "/api/infer", payload: { history: [], message: "please respond" } });
    const events = parseSse(res.body);
    expect(events.at(-1)).toEqual({ name: "error", data: { code: "MODEL_UNAVAILABLE", message: expect.any(String) } });
  });

  it("never logs message content", async () => {
    const { app, logs } = await setup(new FakeProvider({ reply: [`echo ${CANARY}`] }));
    await app.inject({ method: "POST", url: "/api/infer", payload: { history: [], message: `my secret ${CANARY}` } });
    await app.inject({ method: "POST", url: "/api/infer", payload: { history: [], message: CANARY, bad: true } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join("")).not.toContain(CANARY);
  });
});

describe("POST /api/chat", () => {
  it("streams a new conversation and 404s an unknown one", async () => {
    const { app } = await setup();
    const ok = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { conversationId: null, message: "hi", useMemories: true, pinnedMemoryIds: [] },
    });
    expect(parseSse(ok.body).at(-1)!.name).toBe("done");
    const missing = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { conversationId: "0192f0c4-0000-7000-8000-000000000000", message: "hi", useMemories: false, pinnedMemoryIds: [] },
    });
    expect(missing.statusCode).toBe(404);
  });
});
