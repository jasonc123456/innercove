import { PrivacyStatusSchema } from "@innercove/core";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { noSafety } from "../chat/safety.js";
import { FakeProvider } from "../inference/index.js";
import { DatabaseStore } from "../store/db.js";
import { endpointClass, readMemoryUsedGb, systemInfo } from "../system.js";
import { signedIn } from "../testing/signed-in.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function setup(locked = false) {
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-privacy-"));
  const database = new DatabaseStore(path.join(dir, "test.db"));
  cleanups.push(async () => { await database.shutdown(); rmSync(dir, { recursive: true, force: true }); });
  if (!locked) await database.setup("fixture-only-passphrase");
  const app = await buildApp(
    { sessionGuard: signedIn,
      provider: new FakeProvider({ reply: ["Okay. ", "Tell me more."] }),
      safety: noSafety,
      systemPrompt: "SYSTEM",
      stats: { lastReply: null },
      database,
      system: { endpointClass: "loopback", acceleration: "cuda", memoryUsedGb: () => 42.5 },
    },
    false,
  );
  cleanups.unshift(async () => { await app.close(); });
  return { app, database };
}

describe("GET /api/privacy-status", () => {
  it("reports the §3c shape, and the last reply's speed after a chat", async () => {
    const { app, database } = await setup();
    const before = await app.inject({ method: "GET", url: "/api/privacy-status" });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toEqual({
      locked: false,
      encryption: "sqlcipher",
      dataPath: database.dataPath,
      model: { id: "fake", endpointClass: "loopback" },
      acceleration: "cuda",
      memoryUsedGb: 42.5,
      lastReply: null,
    });

    await app.inject({ method: "POST", url: "/api/infer", payload: { history: [], message: "please respond" } });
    const after = PrivacyStatusSchema.parse((await app.inject({ method: "GET", url: "/api/privacy-status" })).json());
    expect(after.lastReply).toEqual({ firstWordMs: expect.any(Number), tokPerS: expect.any(Number) });
  });

  it("answers 423 while locked (D26: no read exemptions)", async () => {
    const { app } = await setup(true);
    expect((await app.inject({ method: "GET", url: "/api/privacy-status" })).statusCode).toBe(423);
  });
});

describe("endpointClass", () => {
  it.each([
    ["http://127.0.0.1:1234/v1", "loopback"],
    ["http://localhost:1234/v1", "loopback"],
    ["http://[::1]:1234/v1", "loopback"],
    ["http://192.168.2.151:1234/v1", "lan"],
    ["http://10.0.0.5/v1", "lan"],
    ["http://172.20.1.1/v1", "lan"],
    ["http://gx10:1234/v1", "lan"],
    ["http://hub.local/v1", "lan"],
    ["http://[fd00::1]/v1", "lan"],
    ["http://172.32.0.1/v1", "public"],
    ["https://llm.example.com/v1", "public"],
    ["not a url", "public"],
  ])("%s → %s", (url, expected) => {
    expect(endpointClass(url)).toBe(expected);
  });

  it("the fake provider is loopback; an unknown acceleration is reported as unknown", () => {
    expect(systemInfo({ INFERENCE_PROVIDER: "fake", LOCAL_AI_BASE_URL: "https://x.example.com" }).endpointClass).toBe("loopback");
    expect(systemInfo({ INFERENCE_ACCELERATION: "tpu" }).acceleration).toBe("unknown");
    expect(systemInfo({ INFERENCE_ACCELERATION: "cuda" }).acceleration).toBe("cuda");
  });
});

describe("readMemoryUsedGb", () => {
  it("is MemTotal minus MemAvailable, in GB", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "innercove-meminfo-"));
    const file = path.join(dir, "meminfo");
    writeFileSync(file, "MemTotal:       127535912 kB\nMemFree:        27080588 kB\nMemAvailable:   65016404 kB\n");
    expect(readMemoryUsedGb(file)).toBe(59.6);
    expect(readMemoryUsedGb(path.join(dir, "missing"))).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});
