import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { FakeProvider } from "../inference/index.js";
import { noSafety } from "../chat/safety.js";
import { DatabaseStore } from "../store/db.js";
import { base32Decode, base32Encode, currentStep, hotp, verifyTotp } from "./two-factor.js";

const PASSWORD = "test-only-PASSPHRASE-CANARY";
const HOST = "hub.test:8000";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

describe("TOTP (RFC 6238 / RFC 4226)", () => {
  it("matches the RFC test vectors and round-trips base32", () => {
    const secret = Buffer.from("12345678901234567890");
    // RFC 4226 Appendix D, counters 0 and 1 (6 digits).
    expect(hotp(secret, 0)).toBe("755224");
    expect(hotp(secret, 1)).toBe("287082");
    // RFC 6238 Appendix B, T = 59 s → step 1 → 94287082, last 6 digits.
    expect(hotp(secret, currentStep(59_000))).toBe("287082");
    expect(base32Decode(base32Encode(secret)).equals(secret)).toBe(true);
  });

  it("accepts ±1 step, rejects ±2 and anything at or before the last used step", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    const now = 1_000_000 * 30_000;
    const step = currentStep(now);
    const code = (s: number) => hotp(base32Decode(secret), s);
    expect(verifyTotp(secret, code(step), now, null)).toBe(step);
    expect(verifyTotp(secret, code(step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(secret, code(step + 1), now, null)).toBe(step + 1);
    expect(verifyTotp(secret, code(step + 2), now, null)).toBeNull();
    expect(verifyTotp(secret, code(step), now, step)).toBeNull();
    expect(verifyTotp(secret, "12345", now, null)).toBeNull();
  });
});

async function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-2fa-"));
  const database = new DatabaseStore(path.join(dir, "data", "test.db"));
  const app = await buildApp({ database, provider: new FakeProvider({ reply: ["Hello."] }), safety: noSafety, systemPrompt: "SYSTEM", stats: { lastReply: null } }, false);
  cleanups.push(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  await database.setup(PASSWORD);
  const signIn = (code?: string) =>
    app.inject({ method: "POST", url: "/api/session", headers: { host: HOST }, payload: { login: "admin", passphrase: PASSWORD, ...(code ? { code } : {}) } });
  const cookie = String((await signIn()).headers["set-cookie"]).split(";")[0]!;
  const call = (method: "GET" | "POST" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie, host: HOST }, ...(payload ? { payload } : {}) });
  return { app, database, signIn, call };
}

/** Enrolls and confirms; returns the secret and the step the confirm code used. */
async function enable(call: Awaited<ReturnType<typeof fixture>>["call"]) {
  const enroll = await call("POST", "/api/two-factor/enroll");
  expect(enroll.statusCode).toBe(200);
  const { secret, otpauthUri } = enroll.json() as { secret: string; otpauthUri: string };
  expect(otpauthUri).toMatch(/^otpauth:\/\/totp\/InnerCove%3Aadmin\?secret=[A-Z2-7]+&issuer=InnerCove/);
  const step = currentStep(Date.now());
  const confirm = await call("POST", "/api/two-factor/confirm", { code: hotp(base32Decode(secret), step) });
  expect(confirm.statusCode).toBe(200);
  const { recoveryCodes } = confirm.json() as { recoveryCodes: string[] };
  return { secret, step, recoveryCodes };
}

describe("D47 two-factor sign-in", () => {
  it("is off by default; enroll + confirm turns it on with 10 recovery codes", async () => {
    const { call } = await fixture();
    expect((await call("GET", "/api/two-factor")).json()).toEqual({ enabled: false, recoveryCodesLeft: 0 });
    const { recoveryCodes } = await enable(call);
    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);
    expect((await call("GET", "/api/two-factor")).json()).toEqual({ enabled: true, recoveryCodesLeft: 10 });
    expect((await call("GET", "/api/session")).json()).toMatchObject({ signedIn: true, twoFactor: true });
    expect((await call("POST", "/api/two-factor/enroll")).statusCode).toBe(409);
  });

  it("a wrong confirm code leaves it off", async () => {
    const { call } = await fixture();
    await call("POST", "/api/two-factor/enroll");
    expect((await call("POST", "/api/two-factor/confirm", { code: "000000" })).statusCode).toBe(400);
    expect((await call("GET", "/api/two-factor")).json()).toMatchObject({ enabled: false });
  });

  it("sign-in then needs the code; a used code can't be replayed; recovery codes work once", async () => {
    const { signIn, call } = await fixture();
    const { secret, step, recoveryCodes } = await enable(call);
    const missing = await signIn();
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.details).toEqual({ twoFactorRequired: true });
    expect(missing.headers["set-cookie"]).toBeUndefined();
    // The confirm code's step is used up; the next step (within ±1) works once.
    expect((await signIn(hotp(base32Decode(secret), step))).statusCode).toBe(401);
    const next = hotp(base32Decode(secret), step + 1);
    const ok = await signIn(next);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ signedIn: true, twoFactor: true });
    expect((await signIn(next)).statusCode).toBe(401);
    expect((await signIn(recoveryCodes[0]!.toUpperCase())).statusCode).toBe(200);
    expect((await signIn(recoveryCodes[0]!)).statusCode).toBe(401);
    expect((await call("GET", "/api/two-factor")).json()).toMatchObject({ recoveryCodesLeft: 9 });
  });

  it("a wrong code on a locked hub leaves it locked; the right one unlocks and signs in", async () => {
    const { database, signIn, call } = await fixture();
    const { recoveryCodes } = await enable(call);
    await database.lock();
    expect((await signIn("123456")).statusCode).toBe(401);
    expect(database.locked).toBe(true);
    expect((await signIn()).statusCode).toBe(401);
    expect(database.locked).toBe(true);
    expect((await signIn(recoveryCodes[1]!)).statusCode).toBe(200);
    expect(database.locked).toBe(false);
  });

  it("turning it off needs a code", async () => {
    const { call, signIn } = await fixture();
    const { recoveryCodes } = await enable(call);
    expect((await call("DELETE", "/api/two-factor", { code: "000000" })).statusCode).toBe(400);
    expect((await call("DELETE", "/api/two-factor", { code: recoveryCodes[2]! })).statusCode).toBe(200);
    expect((await call("GET", "/api/two-factor")).json()).toEqual({ enabled: false, recoveryCodesLeft: 0 });
    expect((await signIn()).statusCode).toBe(200);
  });

  it("two-factor routes need a session", async () => {
    const { app } = await fixture();
    for (const [method, url] of [["GET", "/api/two-factor"], ["POST", "/api/two-factor/enroll"], ["DELETE", "/api/two-factor"]] as const) {
      expect((await app.inject({ method, url, headers: { host: HOST } })).statusCode, url).toBe(401);
    }
  });
});
