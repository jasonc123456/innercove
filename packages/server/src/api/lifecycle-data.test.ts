import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type UserId } from "@innercove/core";
import { buildApp } from "../app.js";
import { DatabaseStore } from "../store/db.js";
import { FakeProvider, type InferenceProvider } from "../inference/index.js";
import { noSafety } from "../chat/safety.js";
import { SettingsRepository } from "../store/repos/settings.js";
import { DiaryRepository } from "../store/repos/diary.js";
import { MemoryRepository } from "../store/repos/memories.js";
import { ConversationRepository } from "../store/repos/conversations.js";
import { uuidv7 } from "../store/repos/common.js";
import { users, settings, devices } from "../store/schema.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const f of cleanups.splice(0)) await f(); });
const secret = "fictional-phase5-passphrase";
const canary = "phasefivecontentcanary";
function events(body: string) { return body.split("\n\n").filter(Boolean).map(b => ({ name: /^event: (.+)$/m.exec(b)?.[1], data: JSON.parse(/^data: (.+)$/m.exec(b)?.[1] ?? "null") })); }
async function fixture(provider: InferenceProvider = new FakeProvider({ reply: ["Fixture response."] })) {
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-phase5-"));
  const file = path.join(dir, "fixture.db");
  const database = new DatabaseStore(file);
  await database.setup(secret);
  const logs: string[] = [];
  const stream = new Writable({ write(chunk, _encoding, cb) { logs.push(String(chunk)); cb(); } });
  const app = await buildApp({ database, provider, safety: noSafety, systemPrompt: "SYSTEM", stats: { lastReply: null } }, { level: "info", stream });
  cleanups.push(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  const reset = (payload: object = { confirm: "DELETE" }) => app.inject({ method: "POST", url: "/api/delete-all", payload });
  const patch = (payload: object) => app.inject({ method: "PATCH", url: "/api/settings", payload });
  return { app, database, file, logs, reset, patch, provider };
}

async function populate(database: DatabaseStore) {
  const lease = database.acquire();
  try {
    const diary = new DiaryRepository(lease);
    const root = diary.create(lease.userId, { origin: "manual", content: `chem ${canary}`, accessLevel: "ai_eligible" });
    diary.create(lease.userId, { origin: "support_note", content: `note ${canary}` });
    const excerpt = diary.create(lease.userId, { origin: "excerpt", content: `derived ${canary}`, sources: [{ sourceType: "diary_entry", sourceId: root.id }], accessLevel: "ai_eligible" });
    const memory = new MemoryRepository(lease).create(lease.userId, { origin: "user", content: `chem memory ${canary}`, accessLevel: "ai_eligible", sources: [{ sourceType: "diary_entry", sourceId: excerpt.id }] });
    const repo = new ConversationRepository(lease);
    const conversation = repo.create(lease.userId, { title: `chat ${canary}` });
    repo.appendMessage(lease.userId, { conversationId: conversation.id, role: "user", content: canary, modelId: null, safetyTier: null });
    const message = repo.appendMessage(lease.userId, { conversationId: conversation.id, role: "assistant", content: `reply ${canary}`, modelId: "fake", safetyTier: 0 });
    lease.db.prepare("INSERT INTO message_context(user_id,message_id,source_type,source_id) VALUES(?,?,'memory',?)").run(lease.userId, message.id, memory.id);
    diary.update(lease.userId, root.id, { accessLevel: "private" }); // tombstones + derived flags
    lease.orm.insert(devices).values({ id: uuidv7(), userId: lease.userId, label: "fictional fixture", platform: "web", tokenHash: "fixture-hash", createdAt: new Date().toISOString() }).run();
    const retained = {
      userId: lease.userId,
      users: lease.orm.select().from(users).all(), settings: lease.orm.select().from(settings).all(), devices: lease.orm.select().from(devices).all(),
      migrations: lease.db.prepare("SELECT * FROM __drizzle_migrations").all(),
    };
    return { retained, root, memory, conversation };
  } finally { lease.release(); }
}

function assertEmpty(database: DatabaseStore) {
  const lease = database.acquire();
  try {
    for (const table of ["conversations", "messages", "diary_entries", "memories", "provenance", "message_context", "tombstones"]) {
      expect(lease.db.prepare(`SELECT * FROM ${table} WHERE user_id=?`).all(lease.userId)).toEqual([]);
    }
    for (const table of ["diary_fts", "memory_fts"]) {
      expect(lease.db.prepare(`SELECT rowid FROM ${table} WHERE ${table} MATCH ? AND user_id=?`).all(canary, lease.userId)).toEqual([]);
      expect(lease.db.prepare(`SELECT * FROM ${table} WHERE user_id=?`).all(lease.userId)).toEqual([]);
    }
    expect(lease.db.pragma("freelist_count", { simple: true })).toBe(0);
    expect(lease.db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(lease.db.pragma("secure_delete", { simple: true })).toBe(1);
    expect(lease.db.prepare("SELECT v FROM diary_fts_config WHERE k='secure-delete'").get()).toEqual({ v: 1 });
    expect(lease.db.prepare("SELECT v FROM memory_fts_config WHERE k='secure-delete'").get()).toEqual({ v: 1 });
  } finally { lease.release(); }
}

describe("Phase 5 settings and exclusive delete-all", () => {
  it("validates partial settings, persists defaults and preserves stronger support-note privacy", async () => {
    const { app, database, patch } = await fixture();
    const original = (await app.inject('/api/settings')).json();
    expect(original).toMatchObject({ useMemoriesDefault: true, diaryDefaultAccessLevel: "private" });
    expect((await patch({})).json()).toEqual(original);
    const updated = (await patch({ useMemoriesDefault: false, diaryDefaultAccessLevel: "ai_eligible" })).json();
    expect(updated).toMatchObject({ userId: original.userId, useMemoriesDefault: false, diaryDefaultAccessLevel: "ai_eligible" });
    for (const payload of [{ userId: "INPUTCANARY" }, { useMemoriesDefault: "true" }, { diaryDefaultAccessLevel: null }, { updatedAt: "INPUTCANARY" }, { unknown: true }]) {
      const response = await patch(payload);
      expect(response.statusCode).toBe(400); expect(response.body).not.toContain("INPUTCANARY");
    }
    const create = (origin: string) => app.inject({ method: "POST", url: "/api/diary", payload: { origin, content: "fictional fixture" } });
    expect((await create("manual")).json().accessLevel).toBe("ai_eligible");
    expect((await create("support_note")).json()).toMatchObject({ accessLevel: "private", includeInHandoff: true });
    await database.lock(); await database.unlock(secret);
    expect((await app.inject('/api/settings')).json()).toEqual(updated);
    expect((await patch({ useMemoriesDefault: true })).json().diaryDefaultAccessLevel).toBe("ai_eligible");
    const temporary = await app.inject({ method: "POST", url: "/api/infer", payload: { history: [], message: "fixture" } });
    expect(events(temporary.body).find(e => e.name === "context")!.data.sources).toEqual([]); // A's temporary default unchanged
  });

  it("requires exact confirmation and locks both settings and deletion endpoints", async () => {
    const { app, database, reset, patch } = await fixture();
    await populate(database);
    for (const payload of [{}, { confirm: "delete" }, { confirm: "DELETE", userId: "bad" }]) expect((await reset(payload)).statusCode).toBe(400);
    expect((await app.inject('/api/diary')).json().entries).toHaveLength(3);
    await database.lock();
    expect((await app.inject('/api/settings')).statusCode).toBe(423);
    expect((await patch({})).statusCode).toBe(423);
    expect((await reset()).statusCode).toBe(423);
    await database.unlock(secret);
    expect((await app.inject('/api/diary')).json().entries).toHaveLength(3);
  });

  it("deletes all content/FTS/derived links, retains identity/settings/devices, VACUUMs and reopens encrypted", async () => {
    const { app, database, file, logs, reset, patch, provider } = await fixture();
    await patch({ useMemoriesDefault: false, diaryDefaultAccessLevel: "ai_eligible" });
    const { retained, conversation, root } = await populate(database);
    const lease = database.acquire();
    const exec = vi.spyOn(lease.db, "exec");
    const pragma = vi.spyOn(lease.db, "pragma");
    lease.release();
    expect((await reset()).json()).toEqual({ deleted: { conversations: 1, diaryEntries: 3, memories: 1 } });
    expect(exec.mock.calls.some(([sql]) => sql === "VACUUM")).toBe(true);
    expect(pragma.mock.calls.filter(([sql]) => sql === "wal_checkpoint(TRUNCATE)")).toHaveLength(2);
    expect(statSync(file + "-wal").size).toBe(0);
    assertEmpty(database);
    const inspect = database.acquire();
    try {
      expect(inspect.userId).toBe(retained.userId);
      expect(inspect.orm.select().from(users).all()).toEqual(retained.users);
      expect(inspect.orm.select().from(settings).all()).toEqual(retained.settings);
      expect(inspect.orm.select().from(devices).all()).toEqual(retained.devices);
      expect(inspect.db.prepare("SELECT * FROM __drizzle_migrations").all()).toEqual(retained.migrations);
    } finally { inspect.release(); }
    expect((await app.inject(`/api/diary/${root.id}`)).statusCode).toBe(404);
    expect((await app.inject(`/api/conversations/${conversation.id}/messages`)).statusCode).toBe(404);
    const next = await app.inject({ method: "POST", url: "/api/chat", payload: { conversationId: null, message: "chem", useMemories: true, pinnedMemoryIds: [] } });
    expect(events(next.body).find(e => e.name === "context")!.data.sources).toEqual([]);
    expect(JSON.stringify((provider as FakeProvider).prompts.at(-1))).not.toContain(canary);
    await reset(); // new conversation is also removed; repeated empty reset is safe.
    expect((await reset()).json()).toEqual({ deleted: { conversations: 0, diaryEntries: 0, memories: 0 } });
    await database.lock();
    expect(readFileSync(file).subarray(0, 16).toString()).not.toBe("SQLite format 3\0");
    const reopened = new DatabaseStore(file);
    cleanups.unshift(async () => { await reopened.shutdown(); });
    await expect(reopened.unlock("wrong-fixture")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await reopened.unlock(secret);
    assertEmpty(reopened);
    const restored = reopened.acquire();
    try { expect(new SettingsRepository(restored).get(restored.userId)).toEqual(retained.settings[0]); expect(restored.orm.select().from(devices).all()).toEqual(retained.devices); } finally { restored.release(); }
    expect(logs.join("")).not.toContain(canary);
  });

  it("scopes deletion, settings and FTS cleanup to the hub user without touching foreign records", async () => {
    const { database, reset, patch } = await fixture();
    await populate(database);
    const lease = database.acquire();
    const other = uuidv7() as UserId;
    let foreignId!: string;
    try {
      const now = new Date().toISOString();
      lease.orm.insert(users).values({ userId: other, createdAt: now }).run();
      lease.orm.insert(settings).values({ userId: other, updatedAt: now }).run();
      foreignId = new DiaryRepository(lease).create(other, { origin: "manual", content: "foreignfixturetoken", accessLevel: "ai_eligible" }).id;
      new MemoryRepository(lease).create(other, { origin: "user", content: "foreignfixturetoken", accessLevel: "ai_eligible", sources: [{ sourceType: "diary_entry", sourceId: foreignId as never }] });
    } finally { lease.release(); }
    await patch({ useMemoriesDefault: false }); await reset(); assertEmpty(database);
    const inspect = database.acquire();
    try {
      expect(new SettingsRepository(inspect).get(other).useMemoriesDefault).toBe(true);
      expect(new DiaryRepository(inspect).get(other, foreignId).content).toBe("foreignfixturetoken");
      expect(inspect.db.prepare("SELECT rowid FROM diary_fts WHERE diary_fts MATCH ? AND user_id=?").all("foreignfixturetoken", other)).toHaveLength(1);
      expect(inspect.db.prepare("SELECT rowid FROM memory_fts WHERE memory_fts MATCH ? AND user_id=?").all("foreignfixturetoken", other)).toHaveLength(1);
      expect(inspect.db.prepare("SELECT * FROM provenance WHERE user_id=?").all(other)).toHaveLength(1);
    } finally { inspect.release(); }
  });

  it.each(["/api/chat", "/api/infer"])("drains active %s streams before deleting; blocks new requests without leaking leases", async route => {
    let entered!: () => void; let finish!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const resume = new Promise<void>(resolve => { finish = resolve; });
    const provider: InferenceProvider = { modelId: "gated", health: async () => ({ modelId: "gated", reachable: true }), async *streamChat() { entered(); yield { type: "text", text: "Fixture first. " }; await resume; yield { type: "text", text: "Fixture complete." }; } };
    const { app, database, reset } = await fixture(provider);
    cleanups.unshift(async () => { finish(); });
    await populate(database);
    const payload = route === "/api/chat" ? { conversationId: null, message: canary, useMemories: true, pinnedMemoryIds: [] } : { history: [], message: canary, useMemories: true };
    const active = app.inject({ method: "POST", url: route, payload }).then(r => r);
    await started;
    const deleting = reset().then(r => r);
    await vi.waitFor(() => expect(database.locked).toBe(true));
    expect((await app.inject('/api/settings')).statusCode).toBe(423);
    expect((await reset()).statusCode).toBe(423);
    let resolved = false; void deleting.then(() => { resolved = true; });
    expect(resolved).toBe(false);
    finish();
    expect(events((await active).body).at(-1)!.name).toBe("done");
    expect((await deleting).statusCode).toBe(200);
    expect(database.locked).toBe(false); assertEmpty(database);
    await database.lock(); await database.unlock(secret); assertEmpty(database);
  });

  it("serializes lock behind deletion while draining an admitted lease", async () => {
    const { database } = await fixture(); await populate(database);
    const lease = database.acquire();
    const deletion = database.deleteAll(); const locking = database.lock();
    expect(() => database.acquire()).toThrow();
    lease.release();
    expect((await deletion).deleted.diaryEntries).toBe(3);
    await locking; expect(database.locked).toBe(true);
    await database.unlock(secret); assertEmpty(database);
  });

  it("shutdown queued during deletion does not close a connection still held by an admitted request", async () => {
    const { database, file } = await fixture(); await populate(database);
    const lease = database.acquire();
    const deletion = database.deleteAll();
    const rejected = expect(deletion).rejects.toMatchObject({ code: "LOCKED" });
    const shutdown = database.shutdown();
    await Promise.resolve();
    expect(lease.db.open).toBe(true);
    lease.release();
    await rejected; await shutdown;
    expect(lease.db.open).toBe(false);
    const reopened = new DatabaseStore(file); cleanups.unshift(async () => { await reopened.shutdown(); });
    await reopened.unlock(secret);
    const inspect = reopened.acquire(); try { expect(new DiaryRepository(inspect).list(inspect.userId, 100).entries).toHaveLength(3); } finally { inspect.release(); }
  });

  it("fails closed and rolls back a failed content transaction without echoing the SQL error", async () => {
    const { database, reset, app } = await fixture(); await populate(database);
    const lease = database.acquire();
    lease.db.exec("CREATE TRIGGER fixture_block BEFORE DELETE ON diary_entries BEGIN SELECT RAISE(ABORT, 'ERRORCONTENTCANARY'); END");
    lease.release();
    const response = await reset();
    expect(response.statusCode).toBe(500); expect(response.body).not.toContain("ERRORCONTENTCANARY");
    expect(database.locked).toBe(true);
    await database.unlock(secret);
    expect((await app.inject('/api/diary')).json().entries).toHaveLength(3);
    expect((await app.inject('/api/memories')).json().memories).toHaveLength(1);
  });

  it("reports compaction failure, stays locked and retains credentials after the deletion commit", async () => {
    const { database, reset } = await fixture(); await populate(database);
    const lease = database.acquire(); const original = lease.db.exec.bind(lease.db);
    vi.spyOn(lease.db, "exec").mockImplementation(sql => { if (sql === "VACUUM") throw new Error("ERRORCONTENTCANARY"); return original(sql); });
    lease.release();
    const response = await reset(); expect(response.statusCode).toBe(500); expect(response.body).not.toContain("ERRORCONTENTCANARY");
    expect(database.locked).toBe(true);
    vi.restoreAllMocks(); await database.unlock(secret);
    const inspect = database.acquire(); try { expect(inspect.db.prepare("SELECT count(*) AS n FROM diary_entries WHERE user_id=?").get(inspect.userId)).toEqual({ n: 0 }); } finally { inspect.release(); }
    expect((await reset()).statusCode).toBe(200); assertEmpty(database);
  });
});
