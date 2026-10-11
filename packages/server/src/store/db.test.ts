import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserIdSchema } from "@innercove/core";
import { DatabaseStore, type DatabaseLease } from "./db.js";
import { migrateDatabase } from "./migrate.js";
import { conversations, diaryEntries, memories, settings, users } from "./schema.js";

const PASSPHRASE = "test-only O'Brien 🔐 passphrase";
const ID = "0192f0c4-0000-7000-8000-000000000001";
const ID2 = "0192f0c4-0000-7000-8000-000000000002";
const MESSAGE = "0192f0c4-0000-7000-8000-000000000003";
const TIME = "2026-10-10T22:00:00.000Z";
const cleanups: (() => Promise<void>)[] = [];
const leases: DatabaseLease[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const lease of leases.splice(0)) lease.release();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
function fixture(now?: () => number) {
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-db-"));
  const file = path.join(dir, "test.db");
  const store = new DatabaseStore(file, now);
  cleanups.push(async () => { await store.shutdown(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, file, store };
}
function lease(store: DatabaseStore) { const item = store.acquire(); leases.push(item); return item; }
function diary(userId: string, id = ID, content = "CANARY_ORIGINAL") {
  return { id, userId, content, origin: "manual" as const, includeInHandoff: false, createdAt: TIME, updatedAt: TIME };
}

describe("encrypted database foundation", () => {
  it("starts locked, sets up encrypted storage, seeds UUIDv7 identity and versioned schema", async () => {
    const { store, file } = fixture();
    expect(store.status).toEqual({ hasPassphrase: false, locked: true });
    await store.setup(PASSPHRASE);
    const { db, orm, userId } = lease(store);
    expect(UserIdSchema.safeParse(userId).success).toBe(true);
    expect(store.status).toEqual({ hasPassphrase: true, locked: false });
    expect(orm.select().from(settings).where(eq(settings.userId, userId)).get()).toMatchObject({
      userId, useMemoriesDefault: true, diaryDefaultAccessLevel: "private",
    });
    const versions = db.prepare("SELECT hash,created_at FROM __drizzle_migrations").all();
    expect(versions).toEqual([
      { hash: expect.stringMatching(/^[a-f0-9]{64}$/), created_at: 1791676800000 },
      // 0001_two_factor (A, D47): TOTP secret and hashed recovery codes.
      { hash: expect.stringMatching(/^[a-f0-9]{64}$/), created_at: 1791763200000 },
    ]);
    const tables = ["users", "conversations", "messages", "diary_entries", "memories", "devices", "settings", "provenance", "message_context", "tombstones", "diary_fts", "memory_fts"];
    for (const table of tables) expect(db.prepare(`PRAGMA table_info(${table})`).all()).toContainEqual(expect.objectContaining({ name: "user_id" }));
    for (const [name, value] of [["journal_mode", "wal"], ["foreign_keys", 1], ["secure_delete", 1], ["temp_store", 2]] as const) {
      expect(db.pragma(name, { simple: true })).toBe(value);
    }
    orm.insert(diaryEntries).values(diary(userId)).run();
    expect(readFileSync(file).subarray(0, 16).toString()).not.toBe("SQLite format 3\0");
    expect(readFileSync(file + "-wal").includes(Buffer.from("CANARY_ORIGINAL"))).toBe(false);
    const plain = new Database(file, { readonly: true });
    try { expect(() => plain.prepare("SELECT * FROM sqlite_master").all()).toThrow(); }
    finally { plain.close(); }
  });

  it("repeats migrations without changing the ledger or existing content", async () => {
    const { store } = fixture(); await store.setup(PASSPHRASE);
    const { db, orm, userId } = lease(store);
    orm.insert(diaryEntries).values(diary(userId)).run();
    const versions = db.prepare("SELECT * FROM __drizzle_migrations").all();
    migrateDatabase(db); migrateDatabase(db);
    expect(db.prepare("SELECT * FROM __drizzle_migrations").all()).toEqual(versions);
    expect(orm.select().from(diaryEntries).where(eq(diaryEntries.userId, userId)).all()).toHaveLength(1);
  });

  it("reopens encrypted data and preserves the user, settings and search index", async () => {
    const { store, file } = fixture(); await store.setup(PASSPHRASE);
    const first = lease(store);
    first.orm.insert(diaryEntries).values(diary(first.userId)).run();
    first.release(); await store.lock();
    expect(first.db.open).toBe(false);
    const reopened = new DatabaseStore(file);
    cleanups.push(async () => { await reopened.shutdown(); });
    expect(reopened.status).toEqual({ hasPassphrase: true, locked: true });
    await reopened.unlock(PASSPHRASE);
    const second = lease(reopened);
    expect(second.userId).toBe(first.userId);
    expect(second.orm.select().from(diaryEntries).where(eq(diaryEntries.userId, second.userId)).get()?.content).toBe("CANARY_ORIGINAL");
    expect(second.db.prepare("SELECT rowid FROM diary_fts WHERE diary_fts MATCH ? AND user_id=?").all("CANARY_ORIGINAL", second.userId)).toHaveLength(1);
    second.release(); await reopened.shutdown();
  });

  it("checks incorrect credentials through a read and closes every failed connection", async () => {
    const { store } = fixture(); await store.setup(PASSPHRASE); await store.lock();
    const key = vi.spyOn(Database.prototype, "key");
    await expect(store.unlock("wrong-passphrase")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(key.mock.contexts).toHaveLength(1);
    expect((key.mock.contexts[0] as Database.Database).open).toBe(false);
    expect(store.locked).toBe(true);
    await store.unlock(PASSPHRASE);
    expect(store.locked).toBe(false);
  });

  it("wipes the mutable credential buffer and never interprets raw-key-looking passwords as keys", async () => {
    const { store } = fixture();
    const key = vi.spyOn(Database.prototype, "key");
    const rawLooking = `x'${"ab".repeat(32)}'`;
    await store.setup(rawLooking); await store.lock(); await store.unlock(rawLooking);
    expect(key.mock.calls).toHaveLength(2);
    for (const [buffer] of key.mock.calls) expect(buffer.every((byte) => byte === 0)).toBe(true);
  });

  it("does not overwrite an existing encrypted database or even an empty existing file", async () => {
    const { store, file } = fixture(); await store.setup(PASSPHRASE); await store.lock();
    const before = readFileSync(file);
    await expect(store.setup("another-passphrase")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(readFileSync(file)).toEqual(before);
    const empty = fixture(); writeFileSync(empty.file, "");
    await expect(empty.store.setup(PASSPHRASE)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(readFileSync(empty.file)).toHaveLength(0);
  });

  it("never opens an existing plaintext database as a successful unlock", async () => {
    const { store, file } = fixture();
    const plain = new Database(file); plain.exec("CREATE TABLE canary(content TEXT)"); plain.close();
    const before = readFileSync(file);
    await expect(store.unlock(PASSPHRASE)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(store.locked).toBe(true); expect(readFileSync(file)).toEqual(before);
  });

  it("cleans up failed initialization and lets setup retry", async () => {
    const { store, dir } = fixture();
    const key = vi.spyOn(Database.prototype, "key");
    const pragma = Database.prototype.pragma;
    vi.spyOn(Database.prototype, "pragma").mockImplementation(function (this: Database.Database, command, options) {
      if (command === "journal_mode=WAL") throw new Error("PRIVATE_CANARY");
      return pragma.call(this, command, options);
    });
    await expect(store.setup(PASSPHRASE)).rejects.toMatchObject({ code: "INTERNAL_ERROR", message: "Unable to initialize database" });
    expect(store.status).toEqual({ hasPassphrase: false, locked: true });
    expect(readdirSync(dir)).toEqual([]);
    expect((key.mock.contexts[0] as Database.Database).open).toBe(false);
    vi.restoreAllMocks(); await store.setup(PASSPHRASE);
  });

  it("rolls back a failing pending migration and does not record its version", async () => {
    const { store } = fixture(); await store.setup(PASSPHRASE);
    const current = lease(store); const db = current.db;
    // Exercise the same Drizzle transaction semantics as production with
    // a deliberately failing two-statement migration in a temporary folder.
    const dir = mkdtempSync(path.join(tmpdir(), "innercove-migration-"));
    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.join(dir, "meta"));
    writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify({ entries: [{ when: 1791763200001, tag: "bad", breakpoints: true }] }));
    writeFileSync(path.join(dir, "bad.sql"), "CREATE TABLE rollback_fixture(x);\n--> statement-breakpoint\nINSERT INTO missing_table VALUES(1);");
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    try {
      expect(() => migrate(current.orm, { migrationsFolder: dir })).toThrow();
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name='rollback_fixture'").get()).toBeUndefined();
      expect(db.prepare("SELECT count(*) n FROM __drizzle_migrations").get()).toEqual({ n: 2 });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("enforces same-user foreign keys, polymorphic links, and content constraints", async () => {
    const { store } = fixture(); await store.setup(PASSPHRASE);
    const { orm, db, userId } = lease(store);
    const other = UserIdSchema.parse(ID2);
    orm.insert(users).values({ userId: other, createdAt: TIME }).run();
    orm.insert(conversations).values({ id: ID, userId, createdAt: TIME, updatedAt: TIME }).run();
    expect(() => db.prepare("INSERT INTO messages(id,user_id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?,?)").run(MESSAGE, other, ID, "user", "fixture", TIME)).toThrow();
    db.prepare("INSERT INTO messages(id,user_id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?,?)").run(MESSAGE, userId, ID, "user", "fixture", TIME);
    orm.insert(diaryEntries).values(diary(other)).run();
    orm.insert(memories).values({ id: ID, userId, content: "fact", origin: "user", status: "approved", createdAt: TIME, updatedAt: TIME }).run();
    expect(() => db.prepare("INSERT INTO message_context VALUES(?,?,?,?)").run(userId, MESSAGE, "diary_entry", ID)).toThrow();
    expect(() => db.prepare("INSERT INTO provenance VALUES(?,?,?,?,?)").run(userId, "memory", ID, "diary_entry", ID)).toThrow();
    expect(() => orm.insert(diaryEntries).values(diary(userId, ID2, "")).run()).toThrow();
    expect(() => db.prepare("INSERT INTO provenance VALUES(?,?,?,?,?)").run(userId, "memory", ID, "manual", ID2)).toThrow();
    db.prepare("INSERT INTO message_context VALUES(?,?,?,?)").run(userId, MESSAGE, "memory", ID);
    db.prepare("INSERT INTO provenance VALUES(?,?,?,?,?)").run(userId, "memory", ID, "message", MESSAGE);
    expect(() => db.prepare("UPDATE message_context SET source_type='diary_entry'").run()).toThrow();
    expect(() => db.prepare("UPDATE provenance SET source_type='diary_entry',source_id=?").run(ID)).toThrow();
    db.prepare("DELETE FROM conversations WHERE user_id=? AND id=?").run(userId, ID);
    expect(db.prepare("SELECT * FROM messages WHERE user_id=?").all(userId)).toEqual([]);
    expect(db.prepare("SELECT * FROM message_context WHERE user_id=?").all(userId)).toEqual([]);
    expect(db.prepare("SELECT source_id FROM provenance WHERE user_id=?").all(userId)).toEqual([{ source_id: MESSAGE }]);
    db.prepare("DELETE FROM memories WHERE user_id=? AND id=?").run(userId, ID);
    expect(db.prepare("SELECT * FROM provenance WHERE user_id=?").all(userId)).toEqual([]);
  });

  it("retains content-free deleted-source links for later D16/D33 filtering", async () => {
    const { store } = fixture(); await store.setup(PASSPHRASE);
    const { db, orm, userId } = lease(store);
    orm.insert(conversations).values({ id: ID, userId, createdAt: TIME, updatedAt: TIME }).run();
    db.prepare("INSERT INTO messages(id,user_id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?,?)").run(MESSAGE, userId, ID, "assistant", "fixture", TIME);
    orm.insert(diaryEntries).values(diary(userId)).run();
    orm.insert(memories).values({ id: ID, userId, content: "fact", origin: "user", status: "approved", createdAt: TIME, updatedAt: TIME }).run();
    db.prepare("INSERT INTO provenance VALUES(?,?,?,?,?)").run(userId, "memory", ID, "diary_entry", ID);
    db.prepare("INSERT INTO message_context VALUES(?,?,?,?)").run(userId, MESSAGE, "diary_entry", ID);
    db.prepare("DELETE FROM diary_entries WHERE user_id=? AND id=?").run(userId, ID);
    expect(db.prepare("SELECT source_id FROM provenance WHERE user_id=?").all(userId)).toEqual([{ source_id: ID }]);
    expect(db.prepare("SELECT source_id FROM message_context WHERE user_id=?").all(userId)).toEqual([{ source_id: ID }]);
    expect(db.prepare("SELECT content FROM diary_entries WHERE user_id=?").all(userId)).toEqual([]);
    db.prepare("DELETE FROM memories WHERE user_id=? AND id=?").run(userId, ID);
    expect(db.prepare("SELECT * FROM provenance WHERE user_id=?").all(userId)).toEqual([]);
    db.prepare("DELETE FROM conversations WHERE user_id=? AND id=?").run(userId, ID);
    expect(db.prepare("SELECT * FROM message_context WHERE user_id=?").all(userId)).toEqual([]);
  });

  it.each(["hash", "version"])("fails closed for a modified migration %s and closes the rejected connection", async (kind) => {
    const { store } = fixture(); await store.setup(PASSPHRASE);
    const active = lease(store);
    active.db.prepare(kind === "hash" ? "UPDATE __drizzle_migrations SET hash='modified'" : "UPDATE __drizzle_migrations SET created_at=created_at+1").run();
    active.release(); await store.lock();
    const key = vi.spyOn(Database.prototype, "key");
    await expect(store.unlock(PASSPHRASE)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(store.locked).toBe(true);
    expect((key.mock.contexts[0] as Database.Database).open).toBe(false);
  });

  it("synchronizes FTS insert/update/delete with actual FTS secure-delete enabled", async () => {
    const { store } = fixture(); await store.setup(PASSPHRASE);
    const { db, orm, userId } = lease(store);
    orm.insert(diaryEntries).values(diary(userId)).run();
    orm.insert(memories).values({ id: ID, userId, content: "CANARY_ORIGINAL", origin: "user", status: "approved", createdAt: TIME, updatedAt: TIME }).run();
    for (const [table, fts] of [["diary_entries", "diary_fts"], ["memories", "memory_fts"]]) {
      expect(db.prepare(`SELECT v FROM ${fts}_config WHERE k='secure-delete'`).get()).toEqual({ v: 1 });
      const search = (word: string) => db.prepare(`SELECT rowid FROM ${fts} WHERE ${fts} MATCH ? AND user_id=?`).all(word, userId);
      expect(search("CANARY_ORIGINAL")).toHaveLength(1);
      db.prepare(`UPDATE ${table} SET content=? WHERE user_id=? AND id=?`).run("CANARY_CHANGED", userId, ID);
      expect(search("CANARY_ORIGINAL")).toEqual([]); expect(search("CANARY_CHANGED")).toHaveLength(1);
      db.prepare(`DELETE FROM ${table} WHERE user_id=? AND id=?`).run(userId, ID);
      expect(search("CANARY_CHANGED")).toEqual([]);
      db.prepare(`INSERT INTO ${fts}(${fts}, rank) VALUES('integrity-check',1)`).run();
    }
  });
});

describe("lifecycle serialization and cleanup", () => {
  it("serializes simultaneous setup/unlock/lock requests and preserves successful state", async () => {
    const { store } = fixture();
    const results = await Promise.allSettled([store.setup(PASSPHRASE), store.setup("another-passphrase")]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    expect((results[1] as PromiseRejectedResult).reason.code).toBe("CONFLICT");
    await Promise.all([store.lock(), store.lock()]);
    await Promise.all([store.unlock(PASSPHRASE), store.unlock(PASSPHRASE)]);
    expect(store.locked).toBe(false);
    await expect(store.unlock("incorrect")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(store.locked).toBe(false);
    await Promise.all([store.lock(), store.unlock(PASSPHRASE), store.lock()]);
    expect(store.locked).toBe(true);
  });

  it("blocks new work immediately, waits for active leases and closes on lock/shutdown", async () => {
    const { store } = fixture(); await store.setup(PASSPHRASE);
    const active = lease(store);
    const closing = store.lock();
    expect(store.locked).toBe(true);
    expect(() => store.acquire()).toThrow();
    await Promise.resolve();
    expect(active.db.open).toBe(true);
    expect(active.db.prepare("SELECT user_id FROM settings WHERE user_id=?").get(active.userId)).toBeDefined();
    active.release(); active.release(); await closing;
    expect(active.db.open).toBe(false);
    await store.unlock(PASSPHRASE);
    const reopened = lease(store); reopened.release(); await store.shutdown();
    expect(reopened.db.open).toBe(false);
    await store.shutdown();
    await expect(store.unlock(PASSPHRASE)).rejects.toMatchObject({ code: "LOCKED" });
  });

  it("enforces a 30 second cooldown after five failed reads and resets after success", async () => {
    let now = 1000;
    const { store } = fixture(() => now); await store.setup(PASSPHRASE); await store.lock();
    for (let i = 0; i < 4; i++) await expect(store.unlock("bad")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(store.unlock("bad")).rejects.toMatchObject({ code: "UNAUTHORIZED", retryAfterSeconds: 30 });
    await expect(store.unlock(PASSPHRASE)).rejects.toMatchObject({ retryAfterSeconds: 30 });
    now += 30000; await store.unlock(PASSPHRASE); await store.lock();
    await expect(store.unlock("bad")).rejects.toMatchObject({ code: "UNAUTHORIZED", retryAfterSeconds: undefined });
    await store.unlock(PASSPHRASE);
  });

  it("rejects unlock before setup and undersized setup without creating a file", async () => {
    const { store } = fixture();
    await expect(store.unlock(PASSPHRASE)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(store.setup("short")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(store.status.hasPassphrase).toBe(false);
  });
});
