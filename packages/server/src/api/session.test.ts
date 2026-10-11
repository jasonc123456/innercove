import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { FakeProvider } from "../inference/index.js";
import { noSafety } from "../chat/safety.js";
import { DatabaseStore } from "../store/db.js";
import { SESSION_COOKIE } from "./session.js";

const PASSWORD = "test-only-PASSPHRASE-CANARY";
const HOST = "hub.test:8000";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** The real SessionStore (no sessionGuard override): what main.ts runs. */
async function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-session-"));
  const database = new DatabaseStore(path.join(dir, "data", "test.db"));
  const app = await buildApp({ database, provider: new FakeProvider({ reply: ["Hello."] }), safety: noSafety, systemPrompt: "SYSTEM", stats: { lastReply: null } }, false);
  cleanups.push(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  await database.setup(PASSWORD);
  const signIn = (login: string, passphrase = PASSWORD, headers: Record<string, string> = {}) =>
    app.inject({ method: "POST", url: "/api/session", headers: { host: HOST, ...headers }, payload: { login, passphrase } });
  const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers["set-cookie"]).split(";")[0]!;
  return { app, database, signIn, cookieOf };
}

describe("D47 sign-in and the session guard", () => {
  it("refuses protected routes without a session (no loopback exemption) and allows the public ones", async () => {
    const { app } = await fixture();
    for (const url of ["/api/diary", "/api/settings", "/api/conversations", "/api/privacy-status"]) {
      const res = await app.inject({ method: "GET", url, remoteAddress: "127.0.0.1" });
      expect(res.statusCode, url).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHORIZED");
    }
    expect((await app.inject({ method: "POST", url: "/api/delete-all", payload: { confirm: "DELETE" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/lock" })).statusCode).toBe(401);
    for (const url of ["/api/health", "/api/lock-status", "/api/session"]) {
      expect((await app.inject({ method: "GET", url })).statusCode, url).toBe(200);
    }
  });

  it("signs in with the username or email plus the passphrase and sets a strict HttpOnly cookie", async () => {
    const { app, signIn, cookieOf } = await fixture();
    for (const login of ["admin", "Admin@InnerCove.local "]) {
      const res = await signIn(login);
      expect(res.statusCode, login).toBe(200);
      expect(res.json()).toMatchObject({ signedIn: true, twoFactor: false });
      const set = String(res.headers["set-cookie"]);
      expect(set).toContain(`${SESSION_COOKIE}=`);
      expect(set).toMatch(/HttpOnly/);
      expect(set).toMatch(/SameSite=Strict/);
      expect(set).toMatch(/Max-Age=43200/);
      const cookie = cookieOf(res);
      expect((await app.inject({ method: "GET", url: "/api/diary", headers: { cookie } })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/api/session", headers: { cookie } })).json()).toMatchObject({ signedIn: true });
    }
  });

  it("gives the same answer for a wrong username or passphrase, then backs off after five failures", async () => {
    const { signIn } = await fixture();
    const wrongUser = await signIn("someone", PASSWORD);
    const wrongPass = await signIn("admin", "wrong");
    expect(wrongUser.statusCode).toBe(401);
    expect(wrongPass.statusCode).toBe(401);
    expect(wrongUser.json()).toEqual(wrongPass.json());
    for (let i = 0; i < 2; i++) await signIn("someone");
    const fifth = await signIn("admin", "wrong");
    expect(fifth.statusCode).toBe(401);
    expect(fifth.headers["retry-after"]).toBe("30");
    // Even the right credentials wait out the backoff.
    expect((await signIn("admin")).statusCode).toBe(401);
  });

  it("doubles the backoff on each further round of failures, up to 15 minutes (D47)", async () => {
    const { SessionStore } = await import("./session.js");
    let now = 0;
    const store = new SessionStore(() => now);
    const round = () => { let wait = 0; for (let i = 0; i < 5; i++) wait = store.fail(); return wait; };
    const waits = [];
    for (let i = 0; i < 7; i++) { waits.push(round()); now += 10 * 60_000 * 2; }
    expect(waits).toEqual([30, 60, 120, 240, 480, 900, 900]);
    store.succeed();
    expect(round()).toBe(30);
  });

  it("unlocks a locked hub on sign-in; locking the hub signs everyone out", async () => {
    const { app, database, signIn, cookieOf } = await fixture();
    await database.lock();
    const res = await signIn("admin");
    expect(res.statusCode).toBe(200);
    expect(database.locked).toBe(false);
    const cookie = cookieOf(res);
    expect((await app.inject({ method: "POST", url: "/api/lock", headers: { cookie, host: HOST } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/session", headers: { cookie } })).json()).toMatchObject({ signedIn: false });
    await database.unlock(PASSWORD);
    expect((await app.inject({ method: "GET", url: "/api/diary", headers: { cookie } })).statusCode).toBe(401);
  });

  it("sign-out revokes the session", async () => {
    const { app, signIn, cookieOf } = await fixture();
    const cookie = cookieOf(await signIn("admin"));
    const out = await app.inject({ method: "DELETE", url: "/api/session", headers: { cookie, host: HOST } });
    expect(String(out.headers["set-cookie"])).toMatch(/Max-Age=0/);
    expect((await app.inject({ method: "GET", url: "/api/diary", headers: { cookie } })).statusCode).toBe(401);
  });

  it("refuses state-changing requests from another origin, even with a valid cookie", async () => {
    const { app, signIn, cookieOf } = await fixture();
    const cookie = cookieOf(await signIn("admin"));
    const evil = await app.inject({ method: "POST", url: "/api/lock", headers: { cookie, host: HOST, origin: "http://evil.test" } });
    expect(evil.statusCode).toBe(403);
    expect((await signIn("admin", PASSWORD, { origin: "http://evil.test" })).statusCode).toBe(403);
    expect((await signIn("admin", PASSWORD, { origin: `http://${HOST}` })).statusCode).toBe(200);
  });
});
