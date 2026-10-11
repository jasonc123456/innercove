import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { DatabaseError, type DatabaseStore } from "../store/db.js";
import { sendError } from "./errors.js";
import { consumeCode, readTwoFactor } from "./two-factor.js";

/**
 * D47 sign-in: one owner per hub, signed in with a username or email plus the hub passphrase.
 * Sessions are random tokens in an HttpOnly, SameSite=Strict cookie; the server keeps only their
 * SHA-256 hashes, in memory, so a restart or "Lock the hub" signs everyone out.
 */
export const ADMIN_LOGINS = ["admin", "admin@innercove.local"] as const;
export const SESSION_COOKIE = "innercove_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
// D47: 5 failures → 30 s, doubling on each further round, up to 15 min.
const BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 15 * 60_000;

// Every /api route needs a session except these (route template AND method, as in lock.ts).
// POST /api/unlock stays open for scripts: the passphrase is its credential, it shares the
// database's failure backoff, and it issues no session (nothing becomes readable through it).
const PUBLIC_ROUTES = new Set([
  "GET /api/health", "GET /api/lock-status", "POST /api/setup", "POST /api/unlock",
  "POST /api/session", "GET /api/session", "DELETE /api/session",
]);

const SessionRequestSchema = z.object({
  login: z.string().min(1).max(254),
  passphrase: z.string().min(1),
  code: z.string().max(16).optional(),
}).strict();

export interface SessionGuard {
  isValid(request: FastifyRequest): boolean;
}

export class SessionStore implements SessionGuard {
  #sessions = new Map<string, number>(); // token hash → expiresAt
  #failures = 0;
  #blockedUntil = 0;
  #rounds = 0;
  constructor(readonly now: () => number = Date.now) {}

  create(): { token: string; expiresAt: number } {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + SESSION_TTL_MS;
    this.#sessions.set(hash(token), expiresAt);
    return { token, expiresAt };
  }

  expiresAt(token: string | undefined): number | null {
    if (!token) return null;
    const key = hash(token);
    const expiresAt = this.#sessions.get(key);
    if (expiresAt === undefined) return null;
    if (expiresAt <= this.now()) {
      this.#sessions.delete(key);
      return null;
    }
    return expiresAt;
  }

  isValid(request: FastifyRequest): boolean {
    return this.expiresAt(readCookie(request)) !== null;
  }

  revoke(token: string | undefined) {
    if (token) this.#sessions.delete(hash(token));
  }

  clear() {
    this.#sessions.clear();
  }

  /** Seconds left in the failure backoff, or 0. */
  blockedFor(): number {
    return Math.max(0, Math.ceil((this.#blockedUntil - this.now()) / 1000));
  }

  /** Counts a failed sign-in; returns the backoff in seconds once it starts. */
  fail(): number {
    if (++this.#failures < MAX_FAILURES) return 0;
    this.#failures = 0;
    const ms = Math.min(BACKOFF_MS * 2 ** this.#rounds, MAX_BACKOFF_MS);
    this.#rounds++;
    this.#blockedUntil = this.now() + ms;
    return ms / 1000;
  }

  succeed() {
    this.#failures = 0;
    this.#blockedUntil = 0;
    this.#rounds = 0;
  }
}

/**
 * Registers the 401 guard and the session routes. Must run before databaseRoutes so an
 * unauthenticated caller is turned away before the lock gate or any lease.
 * No loopback or environment exemption (D47).
 */
export function sessionRoutes(app: FastifyInstance, database: DatabaseStore, sessions: SessionStore, guard: SessionGuard = sessions) {
  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0]!;
    if (path !== "/api" && !path.startsWith("/api/")) return;
    if (!sameOrigin(request)) return sendError(reply, "FORBIDDEN", "Cross-origin request refused");
    const route = request.routeOptions.url ?? path;
    if (PUBLIC_ROUTES.has(`${request.method} ${route}`)) return;
    // A locked hub holds nothing readable; databaseRoutes answers 423 so the UI knows to sign in.
    if (database.locked) return;
    if (!guard.isValid(request)) return sendError(reply, "UNAUTHORIZED", "Sign-in required");
  });

  // Locking the hub signs everyone out (Admin → Lock the hub).
  app.addHook("onResponse", async (request, reply) => {
    if (request.method === "POST" && request.routeOptions.url === "/api/lock" && reply.statusCode === 200) sessions.clear();
  });

  app.post("/api/session", async (request, reply) => {
    const parsed = SessionRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, "VALIDATION_ERROR", "Invalid sign-in request");
    const wait = sessions.blockedFor();
    if (wait > 0) return tooMany(reply, wait);
    const login = parsed.data.login.trim().toLowerCase();
    if (!(ADMIN_LOGINS as readonly string[]).includes(login)) return failed(reply, sessions.fail());
    const wasLocked = database.locked;
    try {
      // Unlocks the database after a restart; when already unlocked it re-verifies the passphrase.
      await database.unlock(parsed.data.passphrase);
    } catch (error) {
      if (error instanceof DatabaseError && error.code === "UNAUTHORIZED") {
        if (error.retryAfterSeconds !== undefined) return tooMany(reply, error.retryAfterSeconds);
        return failed(reply, sessions.fail());
      }
      if (error instanceof DatabaseError) return sendError(reply, error.code, error.message);
      return sendError(reply, "INTERNAL_ERROR", "Sign-in failed");
    }
    // Two-factor (D47): the secret is inside the database the passphrase just opened.
    let twoFactor = false;
    let codeProblem: "missing" | "wrong" | null = null;
    const lease = database.acquire();
    try {
      const state = readTwoFactor(lease);
      if (state?.enabled) {
        twoFactor = true;
        const code = parsed.data.code?.trim();
        if (!code) codeProblem = "missing";
        else if (!consumeCode(lease, state, code, sessions.now())) codeProblem = "wrong";
      }
    } finally { lease.release(); }
    if (codeProblem) {
      // No session without the code; a hub this attempt unlocked goes back to locked.
      if (wasLocked) await database.lock().catch(() => {});
      if (codeProblem === "missing") {
        return sendError(reply, "UNAUTHORIZED", "Enter the code from your authenticator app", { twoFactorRequired: true });
      }
      const wait = sessions.fail();
      if (wait > 0) return tooMany(reply, wait);
      return sendError(reply, "UNAUTHORIZED", "That code didn't work", { twoFactorRequired: true });
    }
    sessions.succeed();
    sessions.revoke(readCookie(request));
    const { token, expiresAt } = sessions.create();
    setCookie(request, reply, token, SESSION_TTL_MS / 1000);
    return { signedIn: true, twoFactor, expiresAt: new Date(expiresAt).toISOString() };
  });

  app.get("/api/session", async (request) => {
    const expiresAt = sessions.expiresAt(readCookie(request));
    const signedIn = expiresAt !== null && !database.locked;
    let twoFactor = false;
    if (signedIn) {
      const lease = database.acquire();
      try { twoFactor = readTwoFactor(lease)?.enabled ?? false; } finally { lease.release(); }
    }
    return {
      signedIn,
      twoFactor,
      expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
    };
  });

  app.delete("/api/session", async (request, reply) => {
    sessions.revoke(readCookie(request));
    setCookie(request, reply, "", 0);
    return { signedIn: false };
  });

  app.delete("/api/sessions", async (request, reply) => {
    sessions.clear();
    setCookie(request, reply, "", 0);
    return { signedIn: false };
  });
}

function failed(reply: FastifyReply, backoffSeconds: number) {
  if (backoffSeconds > 0) return tooMany(reply, backoffSeconds);
  return sendError(reply, "UNAUTHORIZED", "Wrong username or passphrase");
}

function tooMany(reply: FastifyReply, seconds: number) {
  reply.header("Retry-After", seconds);
  return sendError(reply, "UNAUTHORIZED", "Sign-in temporarily delayed");
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readCookie(request: FastifyRequest): string | undefined {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || undefined;
  }
  return undefined;
}

function setCookie(request: FastifyRequest, reply: FastifyReply, token: string, maxAgeSeconds: number) {
  const secure = request.protocol === "https" ? "; Secure" : "";
  reply.header("set-cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`);
}

/**
 * Browsers send Origin on every state-changing request; it must name this hub. Requests without
 * Origin (curl, scripts on the hub) still need the cookie. SameSite=Strict is the second layer.
 */
function sameOrigin(request: FastifyRequest): boolean {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return true;
  const origin = request.headers.origin;
  if (!origin) return request.headers["sec-fetch-site"] !== "cross-site";
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}
