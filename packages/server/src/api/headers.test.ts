import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, CONTENT_SECURITY_POLICY } from "../app.js";
import { noSafety } from "../chat/safety.js";
import { FakeProvider } from "../inference/index.js";
import { DatabaseStore } from "../store/db.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-headers-"));
  mkdirSync(path.join(dir, "web"));
  writeFileSync(path.join(dir, "web", "index.html"), "<!doctype html><title>t</title>");
  const database = new DatabaseStore(path.join(dir, "test.db"));
  cleanups.push(async () => { await database.shutdown(); rmSync(dir, { recursive: true, force: true }); });
  const app = await buildApp(
    { provider: new FakeProvider(), safety: noSafety, systemPrompt: "S", stats: { lastReply: null }, database, webDist: path.join(dir, "web") },
    false,
  );
  cleanups.unshift(async () => { await app.close(); });
  return app;
}

describe("security headers", () => {
  it("the UI, API and error responses all carry a strict CSP", async () => {
    const app = await setup();
    for (const url of ["/", "/chat", "/api/health", "/api/nope"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.headers["content-security-policy"], url).toBe(CONTENT_SECURITY_POLICY);
      expect(res.headers["x-content-type-options"], url).toBe("nosniff");
      expect(res.headers["referrer-policy"], url).toBe("no-referrer");
    }
  });

  it("allows only the hub itself for scripts and network calls, and no framing", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("unsafe");
  });
});
