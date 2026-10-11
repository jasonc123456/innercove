import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DatabaseLease, DatabaseStore } from "../store/db.js";
import { sendError } from "./errors.js";

/**
 * D47 two-factor: TOTP (RFC 6238; SHA-1, 6 digits, 30 s, ±1 step) with replay protection,
 * plus 10 single-use recovery codes stored only as SHA-256 hashes. The secret lives in the
 * encrypted database (`two_factor`, migration 0001). A lost authenticator is reset only from
 * a shell on the hub (`npm run two-factor:reset`).
 */
export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;
const RECOVERY_CODES = 10;
const ISSUER = "InnerCove";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const char of text.replace(/=+$/, "").toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 4226 HOTP value for one counter, as a zero-padded string. */
export function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1]! & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function currentStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

/** Returns the matching time step within ±1 that is newer than `lastStep`, or null. */
export function verifyTotp(secretBase32: string, code: string, nowMs: number, lastStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const now = currentStep(nowMs);
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (safeEqual(hotp(secret, step), code)) return step;
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function hashRecovery(code: string): string {
  return createHash("sha256").update(normalizeRecovery(code)).digest("hex");
}

function normalizeRecovery(code: string): string {
  return code.replace(/[\s-]/g, "").toLowerCase();
}

function newRecoveryCode(): string {
  const raw = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase();
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

type Row = { secret: string; enabled: number; last_step: number | null; recovery_hashes_json: string };
export type TwoFactorState = { secret: string; enabled: boolean; lastStep: number | null; recoveryHashes: string[] };

export function readTwoFactor(lease: Pick<DatabaseLease, "db" | "userId">): TwoFactorState | null {
  const row = lease.db.prepare("SELECT secret, enabled, last_step, recovery_hashes_json FROM two_factor WHERE user_id = ?").get(lease.userId) as Row | undefined;
  if (!row) return null;
  return { secret: row.secret, enabled: row.enabled === 1, lastStep: row.last_step, recoveryHashes: JSON.parse(row.recovery_hashes_json) as string[] };
}

function write(lease: Pick<DatabaseLease, "db" | "userId">, state: TwoFactorState) {
  const now = new Date().toISOString();
  lease.db.prepare(`INSERT INTO two_factor (user_id, secret, enabled, last_step, recovery_hashes_json, created_at, updated_at)
    VALUES (@userId, @secret, @enabled, @lastStep, @hashes, @now, @now)
    ON CONFLICT(user_id) DO UPDATE SET secret = @secret, enabled = @enabled, last_step = @lastStep, recovery_hashes_json = @hashes, updated_at = @now`)
    .run({ userId: lease.userId, secret: state.secret, enabled: state.enabled ? 1 : 0, lastStep: state.lastStep, hashes: JSON.stringify(state.recoveryHashes), now });
}

export function clearTwoFactor(lease: Pick<DatabaseLease, "db" | "userId">) {
  lease.db.prepare("DELETE FROM two_factor WHERE user_id = ?").run(lease.userId);
}

/**
 * Checks a TOTP or recovery code against an enabled state and records its use
 * (the step for replay protection, or removes the recovery code). Returns true on success.
 */
export function consumeCode(lease: Pick<DatabaseLease, "db" | "userId">, state: TwoFactorState, code: string, nowMs: number): boolean {
  const trimmed = code.trim();
  const step = verifyTotp(state.secret, trimmed, nowMs, state.lastStep);
  if (step !== null) {
    write(lease, { ...state, lastStep: step });
    return true;
  }
  const hash = hashRecovery(trimmed);
  const index = state.recoveryHashes.findIndex((stored) => safeEqual(stored, hash));
  if (index < 0) return false;
  write(lease, { ...state, recoveryHashes: state.recoveryHashes.filter((_, i) => i !== index) });
  return true;
}

const CodeSchema = z.object({ code: z.string().min(6).max(16) }).strict();

/** Routes behind the session guard (only a signed-in owner can change two-factor). */
export function twoFactorRoutes(app: FastifyInstance, database: DatabaseStore, now: () => number = Date.now) {
  const withLease = async <T>(run: (lease: DatabaseLease) => T): Promise<T> => {
    const lease = database.acquire();
    try { return run(lease); } finally { lease.release(); }
  };

  app.get("/api/two-factor", async () => withLease((lease) => {
    const state = readTwoFactor(lease);
    return { enabled: state?.enabled ?? false, recoveryCodesLeft: state?.enabled ? state.recoveryHashes.length : 0 };
  }));

  app.post("/api/two-factor/enroll", async (request, reply) => withLease((lease) => {
    if (request.body !== undefined && request.body !== null) return sendError(reply, "VALIDATION_ERROR", "Enroll has no request body");
    const state = readTwoFactor(lease);
    if (state?.enabled) return sendError(reply, "CONFLICT", "Two-factor is already on");
    // A fresh secret each time; it isn't active until confirmed with a code from it.
    const secret = base32Encode(randomBytes(20));
    write(lease, { secret, enabled: false, lastStep: null, recoveryHashes: [] });
    const label = encodeURIComponent(`${ISSUER}:admin`);
    const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=${ISSUER}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_STEP_SECONDS}`;
    return { otpauthUri, secret };
  }));

  app.post("/api/two-factor/confirm", async (request, reply) => withLease((lease) => {
    const parsed = CodeSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, "VALIDATION_ERROR", "Invalid code");
    const state = readTwoFactor(lease);
    if (!state || state.enabled) return sendError(reply, "CONFLICT", "Start two-factor setup first");
    const step = verifyTotp(state.secret, parsed.data.code.trim(), now(), null);
    // 400, not 401: on a signed-in route 401 means "no session" and would sign the owner out.
    if (step === null) return sendError(reply, "VALIDATION_ERROR", "That code didn't match");
    const recoveryCodes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
    write(lease, { secret: state.secret, enabled: true, lastStep: step, recoveryHashes: recoveryCodes.map(hashRecovery) });
    return { recoveryCodes };
  }));

  app.delete("/api/two-factor", async (request, reply) => withLease((lease) => {
    const parsed = CodeSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, "VALIDATION_ERROR", "Invalid code");
    const state = readTwoFactor(lease);
    if (!state?.enabled) return sendError(reply, "CONFLICT", "Two-factor is off");
    if (!consumeCode(lease, state, parsed.data.code, now())) return sendError(reply, "VALIDATION_ERROR", "That code didn't match");
    clearTwoFactor(lease);
    return { enabled: false };
  }));
}
