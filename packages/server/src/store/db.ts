import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { eq } from "drizzle-orm";
import { UserIdSchema, type ApiErrorCode, type UserId } from "@innercove/core";
import { deleteUserContent } from "./delete-all.js";
import { configureCipher } from "./cipher.js";
import { migrateDatabase } from "./migrate.js";
import { settings, users } from "./schema.js";

export class DatabaseError extends Error {
  constructor(readonly code: ApiErrorCode, message: string, readonly retryAfterSeconds?: number) {
    super(message);
  }
}

function uuidv7() {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6]! & 15) | 0x70;
  bytes[8] = (bytes[8]! & 63) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function configureStorage(db: Database.Database) {
  // Only called after a real read verifies the cipher/key. Check effective
  // settings rather than trusting silent/unsupported pragmas.
  for (const pragma of ["temp_store=MEMORY", "foreign_keys=ON", "secure_delete=ON", "journal_mode=WAL"]) db.pragma(pragma);
  if (db.pragma("temp_store", { simple: true }) !== 2 ||
      db.pragma("foreign_keys", { simple: true }) !== 1 ||
      db.pragma("secure_delete", { simple: true }) !== 1 ||
      db.pragma("journal_mode", { simple: true }) !== "wal") {
    throw new Error("Required database settings unavailable");
  }
}

type Connection = { db: Database.Database; orm: ReturnType<typeof migrateDatabase>; userId: UserId };
export type DatabaseLease = Connection & { release: () => void };

/** One hub, one seeded user (plan). Lifecycle mutations are serialized.
 * Request leases let lock reject new API work immediately and drain the
 * admitted requests before closing their connection. No cached key. */
export class DatabaseStore {
  readonly dataPath: string;
  #connection: Connection | undefined;
  #queue: Promise<unknown> = Promise.resolve();
  #leases = 0;
  #drained: (() => void) | undefined;
  #pendingLocks = 0;
  #pendingDeletes = 0;
  #shutdown = false;
  #failures = 0;
  #blockedUntil = 0;

  constructor(dataPath: string, private readonly now: () => number = Date.now) {
    this.dataPath = path.resolve(dataPath);
  }

  get locked() { return !this.#connection || this.#pendingLocks > 0 || this.#pendingDeletes > 0 || this.#shutdown; }
  get status() { return { hasPassphrase: existsSync(this.dataPath), locked: this.locked }; }

  #serialize<T>(action: () => T | Promise<T>): Promise<T> {
    const result = this.#queue.then(action);
    this.#queue = result.catch(() => undefined);
    return result;
  }

  #assertRunning() {
    if (this.#shutdown) throw new DatabaseError("LOCKED", "Database is closed");
  }

  #open(passphrase: string, fresh: boolean): Connection {
    const db = new Database(this.dataPath, { fileMustExist: true });
    try {
      configureCipher(db, passphrase);
      try {
        // sqlite_master forces authenticated page decoding, unlike open().
        db.prepare("SELECT count(*) FROM sqlite_master").get();
        if (!fresh && !db.prepare("SELECT 1 FROM users LIMIT 1").get()) {
          throw new Error("Database identity missing");
        }
      } catch {
        throw new DatabaseError("UNAUTHORIZED", "Unable to unlock database");
      }
      configureStorage(db);
      const orm = migrateDatabase(db);
      const userId = db.transaction(() => {
        const existing = orm.select().from(users).all();
        if (fresh) {
          if (existing.length) throw new Error("Database already initialized");
          const userId = UserIdSchema.parse(uuidv7());
          const timestamp = new Date().toISOString();
          orm.insert(users).values({ userId, createdAt: timestamp }).run();
          orm.insert(settings).values({ userId, updatedAt: timestamp }).run();
          return userId;
        }
        if (existing.length !== 1) throw new Error("Invalid hub identity");
        const userId = UserIdSchema.parse(existing[0]!.userId);
        if (!orm.select().from(settings).where(eq(settings.userId, userId)).get()) throw new Error("Settings missing");
        return userId;
      })();
      // Success requires the initialized schema, identity and settings to
      // be readable; migrations/seed failures never publish a connection.
      db.prepare("SELECT user_id FROM settings WHERE user_id=?").get(userId);
      return { db, orm, userId };
    } catch (error) {
      db.close();
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError("INTERNAL_ERROR", "Unable to initialize database");
    }
  }

  setup(passphrase: string): Promise<void> {
    return this.#serialize(() => {
      this.#assertRunning();
      if (this.status.hasPassphrase) throw new DatabaseError("CONFLICT", "Database already exists");
      if (passphrase.length < 8) throw new DatabaseError("VALIDATION_ERROR", "Passphrase must contain at least 8 characters");
      mkdirSync(path.dirname(this.dataPath), { recursive: true, mode: 0o700 });
      // O_EXCL prevents overwriting even an empty file or racing another
      // process. We remove only files belonging to this failed creation.
      let reserved = false;
      try {
        closeSync(openSync(this.dataPath, "wx", 0o600));
        reserved = true;
        this.#connection = this.#open(passphrase, true);
        this.#failures = 0;
        this.#blockedUntil = 0;
      } catch (error) {
        if (reserved) {
          for (const suffix of ["-wal", "-shm", "-journal", ""]) {
            const file = this.dataPath + suffix;
            if (existsSync(file)) unlinkSync(file);
          }
        }
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new DatabaseError("CONFLICT", "Database already exists");
        if (error instanceof DatabaseError) throw error;
        throw new DatabaseError("INTERNAL_ERROR", "Unable to set up database");
      }
    });
  }

  unlock(passphrase: string): Promise<void> {
    return this.#serialize(() => {
      this.#assertRunning();
      const remaining = Math.ceil((this.#blockedUntil - this.now()) / 1000);
      if (remaining > 0) throw new DatabaseError("UNAUTHORIZED", "Unlock temporarily delayed", remaining);
      if (!this.status.hasPassphrase) throw new DatabaseError("CONFLICT", "Set up the database first");
      if (!passphrase.length) throw new DatabaseError("VALIDATION_ERROR", "Passphrase is required");
      try {
        // Repeated unlock still checks the submitted credentials. The
        // original connection survives a failed redundant attempt.
        const connection = this.#open(passphrase, false);
        if (this.#connection) connection.db.close();
        else this.#connection = connection;
        this.#failures = 0;
        this.#blockedUntil = 0;
      } catch (error) {
        if (error instanceof DatabaseError && error.code === "UNAUTHORIZED") {
          this.#failures++;
          if (this.#failures >= 5) {
            this.#blockedUntil = this.now() + 30000;
            this.#failures = 0;
            throw new DatabaseError("UNAUTHORIZED", "Unlock temporarily delayed", 30);
          }
        }
        if (error instanceof DatabaseError) throw error;
        throw new DatabaseError("INTERNAL_ERROR", "Unable to unlock database");
      }
    });
  }

  acquire(): DatabaseLease {
    if (this.locked || !this.#connection) throw new DatabaseError("LOCKED", "Database is locked");
    const connection = this.#connection;
    this.#leases++;
    let released = false;
    return { ...connection, release: () => {
      if (released) return;
      released = true;
      if (--this.#leases === 0) this.#drained?.();
    } };
  }

  deleteAll(): Promise<ReturnType<typeof deleteUserContent>> {
    // Set admission gate before queueing, just like lock. The delete HTTP
    // handler must not hold the lease this operation waits to drain.
    if (this.locked) return Promise.reject(new DatabaseError("LOCKED", "Database is locked"));
    this.#pendingDeletes++;
    return this.#serialize(async () => {
      try {
        if (this.#leases) await new Promise<void>(resolve => { this.#drained = resolve; });
        this.#assertRunning(); // Shutdown may have queued while requests drained.
        if (!this.#connection) throw new DatabaseError("LOCKED", "Database is locked");
        return deleteUserContent(this.#connection);
      } catch (error) {
        // Do not resume admission after a failed deletion/compaction. The
        // transaction rolls back on delete failure; after commit, cleanup
        // failure is still reported as an error, never a successful reset.
        this.#connection?.db.close();
        this.#connection = undefined;
        if (error instanceof DatabaseError) throw error;
        throw new DatabaseError("INTERNAL_ERROR", "Unable to delete database content");
      } finally {
        this.#drained = undefined;
        this.#pendingDeletes--;
      }
    });
  }

  lock(): Promise<void> {
    this.#pendingLocks++;
    return this.#serialize(async () => {
      try {
        if (this.#leases) await new Promise<void>((resolve) => { this.#drained = resolve; });
        this.#connection?.db.close(); // Native close destroys its cipher context.
        this.#connection = undefined;
      } finally {
        this.#drained = undefined;
        this.#pendingLocks--;
      }
    });
  }

  shutdown(): Promise<void> {
    this.#shutdown = true;
    return this.lock();
  }
}
