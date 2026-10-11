import { Writable } from "node:stream";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import VanillaDatabase from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type DiaryEntryId, type MemoryId, type UserId } from "@innercove/core";
import { buildApp } from "../app.js";
import { FakeProvider, ModelUnavailableError, type InferenceProvider } from "../inference/index.js";
import { noSafety } from "../chat/safety.js";
import { DatabaseStore } from "../store/db.js";
import { SqlChatStore } from "../store/chat-store.js";
import { ConversationRepository } from "../store/repos/conversations.js";
import { MemoryRepository } from "../store/repos/memories.js";
import { DiaryRepository } from "../store/repos/diary.js";
import { uuidv7 } from "../store/repos/common.js";
import { diaryEntries, memories, messageContext, provenance, settings, users } from "../store/schema.js";
import { signedIn } from "../testing/signed-in.js";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const f of cleanup.splice(0)) await f(); });
const secret = "fixture-only-passphrase";
function events(body: string) {
  return body.split("\n\n").filter(Boolean).map(block => ({ name: /^event: (.+)$/m.exec(block)?.[1], data: JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? "null") }));
}
async function fixture(provider: InferenceProvider = new FakeProvider({ reply: ["Saved reply."] })) {
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-data-"));
  const file = path.join(dir, "test.db");
  const database = new DatabaseStore(file);
  await database.setup(secret);
  const logs: string[] = [];
  const stream = new Writable({ write(chunk, _encoding, cb) { logs.push(String(chunk)); cb(); } });
  const app = await buildApp({ sessionGuard: signedIn, database, provider, safety: noSafety, systemPrompt: "SYSTEM", stats: { lastReply: null } }, { level: "info", stream });
  cleanup.push(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  const lease = database.acquire();
  const userId = lease.userId;
  lease.release();
  const diary = async (payload: object) => app.inject({ method: "POST", url: "/api/diary", payload });
  const chat = async (message: string, conversationId: string | null = null) => app.inject({ method: "POST", url: "/api/chat", payload: { conversationId, message, useMemories: true, pinnedMemoryIds: [] } });
  return { app, database, file, logs, userId, diary, chat, provider };
}

describe("Phase 2 data routes and persistent chat", () => {
  it("diary CRUD/FTS works with the model stopped, and deletion removes index content", async () => {
    const stopped: InferenceProvider = { modelId: "stopped", health: async () => ({ modelId: "stopped", reachable: false }), async *streamChat() { throw new Error("must not call model"); } };
    const { app, diary, database } = await fixture(stopped);
    const created = await diary({ origin: "manual", title: "Fixture", content: "uniquephase2canary", tags: ["fixture"], mood: 3 });
    expect(created.statusCode).toBe(201);
    const entry = created.json();
    expect(entry).toMatchObject({ accessLevel: "private", includeInHandoff: false, mood: 3 });
    expect((await app.inject(`/api/diary?q=uniquephase2canary`)).json().entries.map((e: { id: string }) => e.id)).toEqual([entry.id]);
    const patched = await app.inject({ method: "PATCH", url: `/api/diary/${entry.id}`, payload: { content: "replacementtoken", title: null } });
    expect(patched.json()).toMatchObject({ title: null, tags: ["fixture"], mood: 3 });
    expect((await app.inject(`/api/diary?q=uniquephase2canary`)).json().entries).toEqual([]);
    expect((await app.inject(`/api/diary?q=replacementtoken`)).json().entries).toHaveLength(1);
    const deleted = await app.inject({ method: "DELETE", url: `/api/diary/${entry.id}` });
    expect(Object.keys(deleted.json().tombstone).sort()).toEqual(["deletedAt", "entityId", "entityType", "id", "reason", "userId"]);
    expect((await app.inject(`/api/diary/${entry.id}`)).statusCode).toBe(404);
    expect((await app.inject(`/api/diary?q=replacementtoken`)).json().entries).toEqual([]);
    const lease = database.acquire();
    expect(lease.db.prepare("SELECT count(*) AS n FROM diary_fts WHERE diary_fts MATCH ?").get("replacementtoken")).toEqual({ n: 0 });
    lease.release();
  });

  it("supports scoped pagination, nullable patches and strict validation without echoing content", async () => {
    const { app, diary } = await fixture();
    for (let i = 0; i < 3; i++) await diary({ origin: "manual", content: `entry ${i}` });
    const first = (await app.inject("/api/diary?limit=2")).json();
    const second = (await app.inject(`/api/diary?limit=2&cursor=${first.nextCursor}`)).json();
    expect(first.entries).toHaveLength(2);
    expect(second.entries).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.entries, ...second.entries].map(e => e.id)).size).toBe(3);
    expect((await app.inject('/api/diary?q=%22')).statusCode).toBe(400);
    expect((await app.inject('/api/diary?limit=0')).statusCode).toBe(400);
    expect((await app.inject('/api/diary/not-an-id')).statusCode).toBe(400);
    const bad = await diary({ origin: "manual", content: "INPUTCANARY", userId: "bad" });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).not.toContain("INPUTCANARY");
    expect((await diary({ origin: "excerpt", content: "excerpt", sources: [] })).statusCode).toBe(400);
    const conv = (await app.inject({ method: "POST", url: "/api/conversations", payload: { title: "Fixture" } })).json();
    const patch = await app.inject({ method: "PATCH", url: `/api/conversations/${conv.id}`, payload: { title: null } });
    expect(patch.json().title).toBeNull();
    expect((await app.inject(`/api/conversations/${conv.id}`)).json().id).toBe(conv.id);
    expect((await app.inject('/api/conversations')).json().conversations).toHaveLength(1);
  });

  it("honors settings defaults while support notes remain private, and stores excerpt provenance atomically", async () => {
    const { app, database, userId, diary, chat } = await fixture();
    let lease = database.acquire();
    lease.orm.update(settings).set({ diaryDefaultAccessLevel: "ai_eligible" }).where(eq(settings.userId, userId)).run();
    lease.release();
    expect((await diary({ origin: "manual", content: "ordinary" })).json().accessLevel).toBe("ai_eligible");
    expect((await diary({ origin: "support_note", content: "neutral fixture" })).json()).toMatchObject({ accessLevel: "private", includeInHandoff: true });
    const stream = events((await chat("fixture question")).body);
    const sourceId = stream.find(e => e.name === "meta")!.data.userMessageId;
    const excerpt = await diary({ origin: "excerpt", content: "copied fixture", sources: [{ sourceType: "message", sourceId }] });
    expect(excerpt.statusCode).toBe(201);
    lease = database.acquire();
    expect(lease.orm.select().from(provenance).all()).toMatchObject([{ userId, derivedId: excerpt.json().id, sourceId }]);
    const count = lease.orm.select().from(diaryEntries).all().length;
    lease.release();
    expect((await diary({ origin: "excerpt", content: "must rollback", sources: [{ sourceType: "message", sourceId: uuidv7() }] })).statusCode).toBe(404);
    lease = database.acquire();
    expect(lease.orm.select().from(diaryEntries).all()).toHaveLength(count);
    lease.release();
    expect((await app.inject({ method: "PATCH", url: `/api/diary/${excerpt.json().id}`, payload: { origin: "manual" } })).statusCode).toBe(400);
  });

  it("saved chat/history and contexts survive encrypted reopen; source hiding/deletion reaches D33", async () => {
    const { app, diary, chat, database, provider } = await fixture();
    const entry = (await diary({ origin: "manual", title: "chem", content: "chem fixture lesson", accessLevel: "ai_eligible" })).json();
    const turn = events((await chat("chem")).body);
    const id = turn.find(e => e.name === "meta")!.data.conversationId;
    const assistantId = turn.find(e => e.name === "done")!.data.assistantMessageId;
    expect(assistantId).toBeTruthy();
    expect(turn.find(e => e.name === "context")!.data.sources).toMatchObject([{ id: entry.id }]);
    let lease = database.acquire();
    expect(lease.orm.select().from(messageContext).all()).toMatchObject([{ messageId: assistantId, sourceId: entry.id }]);
    lease.release();
    await database.lock();
    expect((await app.inject(`/api/conversations/${id}/messages`)).statusCode).toBe(423);
    await database.unlock(secret);
    const loaded = (await app.inject(`/api/conversations/${id}/messages`)).json().messages;
    expect(loaded.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
    expect(loaded[0].content).toBe("chem");
    expect(loaded[1]).toMatchObject({ id: assistantId, content: "Saved reply.", modelId: "fake" });
    await chat("continue", id);
    expect((provider as FakeProvider).prompts.at(-1)).toContainEqual({ role: "assistant", content: "Saved reply." });
    await app.inject({ method: "PATCH", url: `/api/diary/${entry.id}`, payload: { accessLevel: "private" } });
    const hidden = events((await chat("continue", id)).body);
    expect(hidden.find(e => e.name === "historyExcluded")!.data.count).toBeGreaterThan(0);
    expect(JSON.stringify((provider as FakeProvider).prompts.at(-1))).not.toContain("chem fixture lesson");
    await app.inject({ method: "DELETE", url: `/api/diary/${entry.id}` });
    lease = database.acquire();
    expect(lease.orm.select().from(messageContext).all().some(c => c.sourceId === entry.id)).toBe(true);
    lease.release();
    expect(events((await chat("continue", id)).body).some(e => e.name === "historyExcluded")).toBe(true);
    expect((await app.inject({ method: "DELETE", url: `/api/conversations/${id}` })).json().tombstone.entityType).toBe("conversation");
    expect((await app.inject(`/api/conversations/${id}/messages`)).statusCode).toBe(404);
    lease = database.acquire();
    expect(lease.db.prepare('SELECT count(*) AS n FROM messages WHERE user_id=? AND conversation_id=?').get(lease.userId, id)).toEqual({ n: 0 });
    expect(lease.orm.select().from(messageContext).all()).toEqual([]);
    lease.release();
  });

  it("temporary inference changes no encrypted table and logs neither input nor output content", async () => {
    const { app, database, logs, diary } = await fixture(new FakeProvider({ reply: ["OUTPUTCANARY."] }));
    await diary({ origin: "manual", content: "chem eligible fixture", accessLevel: "ai_eligible" });
    const snapshot = () => {
      const lease = database.acquire();
      try {
        const tables = lease.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
        return tables.map(({ name }) => [name, lease.db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()]);
      } finally { lease.release(); }
    };
    const before = snapshot();
    const res = await app.inject({ method: "POST", url: "/api/infer", payload: { history: [], message: "chem INPUTCANARY", useMemories: true } });
    expect(events(res.body).at(-1)!.name).toBe("done");
    expect(snapshot()).toEqual(before);
    expect(logs.join("")).not.toMatch(/INPUTCANARY|OUTPUTCANARY|chem eligible fixture/);
  });

  it("encrypted diary cannot be read with plaintext SQLite or strings after lock", async () => {
    const { database, diary, file } = await fixture();
    const canary = "ENCRYPTEDDIARYCANARY93xyz";
    await diary({ origin: "manual", content: canary });
    await database.lock();
    const plain = new VanillaDatabase(file, { readonly: true });
    try { expect(() => plain.prepare("SELECT * FROM diary_entries").all()).toThrow(); } finally { plain.close(); }
    // Prefer the system CLI (macOS/Linux). Minimal Linux/WSL environments
    // may only have Python's standard SQLite binding; still perform a real
    // plaintext read there rather than treating a missing executable as proof.
    let cli = spawnSync("sqlite3", [file, "SELECT * FROM diary_entries"], { encoding: "utf8" });
    if (cli.error && (cli.error as NodeJS.ErrnoException).code === "ENOENT") {
      cli = spawnSync("python3", ["-c", "import sqlite3, sys; sqlite3.connect(sys.argv[1]).execute('SELECT * FROM diary_entries').fetchall()", file], { encoding: "utf8" });
    }
    expect(cli.error).toBeUndefined();
    expect(cli.status).not.toBe(0);
    expect(cli.stderr).toMatch(/not a database/);
    expect(readFileSync(file).includes(Buffer.from(canary))).toBe(false);
    expect(execFileSync("strings", [file], { encoding: "utf8" })).not.toContain(canary);
  });

  it("foreign IDs and cursors never disclose or mutate another user's rows or source links", async () => {
    const { app, database, userId, diary } = await fixture();
    const lease = database.acquire();
    const other = uuidv7() as UserId;
    lease.orm.insert(users).values({ userId: other, createdAt: new Date().toISOString() }).run();
    lease.orm.insert(settings).values({ userId: other, updatedAt: new Date().toISOString() }).run();
    const convs = new ConversationRepository(lease);
    const foreign = convs.create(other, { title: "FOREIGNCANARY" });
    const message = convs.appendMessage(other, { conversationId: foreign.id, role: "user", content: "FOREIGNCANARY", safetyTier: null, modelId: null });
    const diaries = new DiaryRepository(lease);
    const entry = diaries.create(other, { origin: "manual", content: "FOREIGNCANARY", accessLevel: "ai_eligible" });
    const sqlStore = new SqlChatStore(lease);
    expect(await sqlStore.reads.listDiaryCandidates({ userId, limit: 10 })).toEqual([]);
    await expect(sqlStore.history.listMessages({ userId, conversationId: foreign.id })).rejects.toThrow();
    await expect(sqlStore.persistence.appendMessage({ userId, conversationId: foreign.id, role: "user", content: "bad", safetyTier: null, modelId: null })).rejects.toThrow();
    await expect(sqlStore.contexts.listContextForMessages({ userId: other, messageIds: [message.id] })).rejects.toThrow();
    lease.release();
    for (const base of [`/api/conversations/${foreign.id}`, `/api/diary/${entry.id}`]) {
      expect((await app.inject(base)).statusCode).toBe(404);
      expect((await app.inject({ method: "PATCH", url: base, payload: { title: "bad" } })).statusCode).toBe(404);
      expect((await app.inject({ method: "DELETE", url: base })).statusCode).toBe(404);
    }
    expect((await app.inject(`/api/conversations/${foreign.id}/messages`)).statusCode).toBe(404);
    expect((await app.inject(`/api/conversations?cursor=${foreign.id}`)).statusCode).toBe(404);
    expect((await app.inject(`/api/diary?cursor=${entry.id}`)).statusCode).toBe(404);
    expect((await app.inject('/api/diary?q=FOREIGNCANARY')).json().entries).toEqual([]);
    const failed = await diary({ origin: "excerpt", content: "bad", sources: [{ sourceType: "message", sourceId: message.id }] });
    expect(failed.statusCode).toBe(404);
    const inspect = database.acquire();
    expect(new ConversationRepository(inspect).get(other, foreign.id).title).toBe("FOREIGNCANARY");
    expect(new DiaryRepository(inspect).get(other, entry.id).content).toBe("FOREIGNCANARY");
    inspect.release();
  });

  it("atomic reply/context insertion rolls back on an invalid source and bounded history stays ordered", async () => {
    const { database } = await fixture();
    const lease = database.acquire();
    const store = new SqlChatStore(lease);
    const conversation = await store.persistence.saveConversation({ userId: lease.userId, title: null });
    await expect(store.persistence.appendMessageWithContext!({ userId: lease.userId, conversationId: conversation.id, role: "assistant", content: "must rollback", modelId: "fake", safetyTier: 0 }, [{ sourceType: "diary_entry", sourceId: uuidv7() as never }])).rejects.toThrow();
    expect(await store.history.listMessages({ userId: lease.userId, conversationId: conversation.id })).toEqual([]);
    for (let i = 0; i < 3; i++) await store.persistence.appendMessage({ userId: lease.userId, conversationId: conversation.id, role: "user", content: `message ${i}`, modelId: null, safetyTier: 0 });
    expect(store.conversations.listMessages(lease.userId, conversation.id, 2).map(m => m.content)).toEqual(["message 1", "message 2"]);
    const history = await store.history.listMessages({ userId: lease.userId, conversationId: conversation.id });
    expect(history.map(m => m.createdAt)).toEqual([...history.map(m => m.createdAt)].sort());
    expect(new Set(history.map(m => m.createdAt)).size).toBe(3);
    lease.release();
  });

  it("saved model failure retains only the user's message", async () => {
    const down: InferenceProvider = { modelId: "down", health: async () => ({ modelId: "down", reachable: false }), async *streamChat() { throw new ModelUnavailableError("fixture"); } };
    const { app, chat } = await fixture(down);
    const turn = events((await chat("fixture question")).body);
    const id = turn.find(e => e.name === "meta")!.data.conversationId;
    expect(turn.at(-1)!.name).toBe("error");
    expect((await app.inject(`/api/conversations/${id}/messages`)).json().messages.map((m: { role: string }) => m.role)).toEqual(["user"]);
  });
  it("SQL read/context ports fail closed on foreign, private, missing and cyclic sources", async () => {
    const { database, userId } = await fixture();
    const lease = database.acquire();
    const store = new SqlChatStore(lease);
    const diary = new DiaryRepository(lease);
    const source = diary.create(userId, { origin: "manual", content: "eligible", accessLevel: "ai_eligible" });
    const derived = diary.create(userId, { origin: "manual", content: "derived", accessLevel: "ai_eligible", sources: [{ sourceType: "diary_entry", sourceId: source.id }] });
    const now = new Date().toISOString();
    const memoryId = uuidv7() as MemoryId;
    lease.orm.insert(memories).values({ id: memoryId, userId, content: "memory", origin: "ai_proposal", status: "approved", accessLevel: "ai_eligible", createdAt: now, updatedAt: now }).run();
    lease.orm.insert(provenance).values({ userId, derivedType: "memory", derivedId: memoryId, sourceType: "diary_entry", sourceId: derived.id }).run();
    const candidates = () => store.reads.listMemoryCandidates({ userId, limit: 10 });
    expect((await candidates()).map(m => m.id)).toEqual([memoryId]);
    const conv = store.conversations.create(userId, {});
    const msg = store.conversations.appendMessage(userId, { conversationId: conv.id, role: "assistant", content: "fixture", modelId: "fake", safetyTier: 0 });
    await store.persistence.recordMessageContext({ userId, messageId: msg.id, sourceType: "memory", sourceId: memoryId });
    expect(await store.contexts.listContextForMessages({ userId, messageIds: [msg.id] })).toMatchObject([{ messageId: msg.id, sourceId: memoryId }]);
    expect(await store.contexts.listContextForMessages({ userId, messageIds: [] })).toEqual([]);
    diary.update(userId, source.id, { accessLevel: "private" });
    expect(await candidates()).toEqual([]);
    expect((await store.reads.listDiaryCandidates({ userId, limit: 10 })).map(d => d.id)).not.toContain(derived.id);
    const since = lease.db.prepare("SELECT deleted_at FROM tombstones WHERE user_id=? AND entity_id=?").get(userId, source.id) as { deleted_at: string };
    expect(await store.revocations.listTombstonesSince({ userId, since: since.deleted_at })).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: source.id, reason: "access_revoked" })]));
    diary.update(userId, source.id, { accessLevel: "ai_eligible" });
    expect(await candidates()).toEqual([]); // Restoring a source does not re-confirm descendants.
    diary.update(userId, derived.id, { accessLevel: "ai_eligible" });
    new MemoryRepository(lease).update(userId, memoryId, { accessLevel: "ai_eligible" });
    expect(await candidates()).toHaveLength(1);
    lease.orm.update(memories).set({ status: "proposed" }).where(eq(memories.id, memoryId)).run();
    expect(await candidates()).toEqual([]);
    lease.orm.update(memories).set({ status: "approved" }).where(eq(memories.id, memoryId)).run();
    lease.orm.insert(provenance).values({ userId, derivedType: "diary_entry", derivedId: source.id, sourceType: "diary_entry", sourceId: derived.id }).run();
    expect(await candidates()).toEqual([]); // Recursive cycle.
    lease.orm.delete(provenance).where(eq(provenance.derivedId, source.id)).run();
    diary.delete(userId, source.id);
    expect(await candidates()).toEqual([]); // Source ID remains but cannot resolve.
    await expect(store.persistence.recordMessageContext({ userId, messageId: msg.id, sourceType: "diary_entry", sourceId: uuidv7() as DiaryEntryId })).rejects.toThrow();
    lease.release();
  });

  it("lock drains a saved SSE request while its SQL lease persists the completed reply", async () => {
    let entered!: () => void;
    let finish!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const resume = new Promise<void>(resolve => { finish = resolve; });
    const provider: InferenceProvider = { modelId: "gated", health: async () => ({ modelId: "gated", reachable: true }), async *streamChat() {
      entered();
      yield { type: "text", text: "First sentence. " };
      await resume;
      yield { type: "text", text: "Completed." };
    } };
    const { database, app, chat } = await fixture(provider);
    const request = chat("fixture question").then(r => r);
    await started;
    const locking = database.lock();
    expect((await app.inject('/api/diary')).statusCode).toBe(423);
    finish();
    const turn = events((await request).body);
    expect(turn.at(-1)!.name).toBe("done");
    await locking;
    await database.unlock(secret);
    const id = turn.find(e => e.name === "meta")!.data.conversationId;
    expect((await app.inject(`/api/conversations/${id}/messages`)).json().messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
  });

  it("disconnect discards a partial saved reply but keeps its user message and releases the SQL lease", async () => {
    let aborted!: () => void;
    const stopped = new Promise<void>(resolve => { aborted = resolve; });
    const provider: InferenceProvider = { modelId: "abortable", health: async () => ({ modelId: "abortable", reachable: true }), async *streamChat(_messages, options = {}) {
      yield { type: "text", text: "Partial sentence. " };
      if (!options.signal?.aborted) await new Promise<void>(resolve => options.signal!.addEventListener("abort", () => resolve(), { once: true }));
      aborted();
      options.signal?.throwIfAborted();
    } };
    const { app, database } = await fixture(provider);
    const base = await app.listen({ host: "127.0.0.1", port: 0 });
    const controller = new AbortController();
    const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: null, message: "fixture", useMemories: false, pinnedMemoryIds: [] }), signal: controller.signal });
    const reader = response.body!.getReader();
    let body = "";
    while (!body.includes("event: delta")) body += new TextDecoder().decode((await reader.read()).value);
    const id = events(body).find(e => e.name === "meta")!.data.conversationId;
    controller.abort();
    await stopped;
    await database.lock(); // Would hang if the disconnected request leaked a lease.
    await database.unlock(secret);
    expect((await app.inject(`/api/conversations/${id}/messages`)).json().messages.map((m: { role: string }) => m.role)).toEqual(["user"]);
  });

});
