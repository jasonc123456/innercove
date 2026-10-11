import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { type UserId } from "@innercove/core";
import { buildApp } from "../app.js";
import { FakeProvider } from "../inference/index.js";
import { noSafety } from "../chat/safety.js";
import { DatabaseStore } from "../store/db.js";
import { SqlChatStore } from "../store/chat-store.js";
import { MemoryRepository } from "../store/repos/memories.js";
import { DiaryRepository } from "../store/repos/diary.js";
import { ConversationRepository } from "../store/repos/conversations.js";
import { uuidv7 } from "../store/repos/common.js";
import { users, settings, provenance } from "../store/schema.js";
import { signedIn } from "../testing/signed-in.js";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const f of cleanup.splice(0)) await f(); });
const secret = "fictional-test-passphrase";
const manual = [{ sourceType: "manual", sourceId: null }];
function events(body: string) {
  return body.split("\n\n").filter(Boolean).map(block => ({ name: /^event: (.+)$/m.exec(block)?.[1], data: JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? "null") }));
}
async function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-memory-"));
  const database = new DatabaseStore(path.join(dir, "fixture.db"));
  await database.setup(secret);
  const provider = new FakeProvider({ reply: messages => [messages.at(-1)!.content.includes("FIRSTQUESTION") ? "FIRSTREPLYCANARY." : "Fresh fixture reply."] });
  const logs: string[] = [];
  const stream = new Writable({ write(chunk, _encoding, cb) { logs.push(String(chunk)); cb(); } });
  const app = await buildApp({ sessionGuard: signedIn, database, provider, safety: noSafety, systemPrompt: "SYSTEM", stats: { lastReply: null } }, { level: "info", stream });
  cleanup.push(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  const memory = (payload: object) => app.inject({ method: "POST", url: "/api/memories", payload });
  const diary = (payload: object) => app.inject({ method: "POST", url: "/api/diary", payload });
  const patch = (base: string, payload: object) => app.inject({ method: "PATCH", url: base, payload });
  const chat = (message: string, conversationId: string | null = null, useMemories = true, pinnedMemoryIds: string[] = []) => app.inject({ method: "POST", url: "/api/chat", payload: { message, conversationId, useMemories, pinnedMemoryIds } });
  const pool = async () => { const lease = database.acquire(); try { return await new SqlChatStore(lease).reads.listMemoryCandidates({ userId: lease.userId, limit: 100 }); } finally { lease.release(); } };
  return { database, app, provider, logs, memory, diary, patch, chat, pool };
}

describe("Phase 3 SQL memory API, provenance and prompt permissions", () => {
  it("implements strict CRUD, immutable sources, pagination/filtering and proposal-only review", async () => {
    const { app, memory, patch, database, pool } = await fixture();
    const created = await memory({ content: "chem approved", origin: "user", accessLevel: "ai_eligible", sources: manual });
    expect(created.statusCode).toBe(201);
    const item = created.json();
    expect(item).toMatchObject({ status: "approved", origin: "user" });
    expect((await patch(`/api/memories/${item.id}`, { content: "chem updated" })).json().content).toBe("chem updated");
    const proposal = (await memory({ content: "chem proposal", origin: "ai_proposal", accessLevel: "ai_eligible", sources: manual })).json();
    expect(proposal.status).toBe("proposed");
    expect((await pool()).map(m => m.id)).toEqual([item.id]);
    const review = (id: string, status: string) => app.inject({ method: "POST", url: `/api/memories/${id}/review`, payload: { status } });
    expect((await review(item.id, "rejected")).statusCode).toBe(409);
    expect((await review(proposal.id, "approved")).json().status).toBe("approved");
    expect(await pool()).toHaveLength(2);
    expect((await review(proposal.id, "rejected")).json().status).toBe("rejected");
    expect((await pool()).map(m => m.id)).toEqual([item.id]);
    const first = (await app.inject("/api/memories?limit=1")).json();
    const second = (await app.inject(`/api/memories?limit=1&cursor=${first.nextCursor}`)).json();
    expect(new Set([...first.memories, ...second.memories].map(m => m.id)).size).toBe(2);
    expect(second.nextCursor).toBeNull();
    expect((await app.inject("/api/memories?origin=ai_proposal&status=rejected")).json().memories.map((m: { id: string }) => m.id)).toEqual([proposal.id]);
    for (const field of ["status", "origin", "sources", "userId"]) expect((await patch(`/api/memories/${item.id}`, { [field]: "CANARY" })).statusCode).toBe(400);
    const invalid = await memory({ content: "INPUTCANARY", origin: "user", accessLevel: "ai_eligible", sources: manual, status: "approved" });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body).not.toContain("INPUTCANARY");
    expect((await memory({ content: "empty sources", origin: "user", accessLevel: "private", sources: [] })).statusCode).toBe(400);
    expect((await app.inject("/api/memories?limit=0")).statusCode).toBe(400);
    expect((await app.inject("/api/memories/not-an-id")).statusCode).toBe(400);
    await patch(`/api/memories/${item.id}`, { content: "uniquememoryftstoken" });
    expect((await app.inject({ method: "DELETE", url: `/api/memories/${item.id}` })).json().tombstone).toMatchObject({ entityType: "memory", reason: "user_deleted" });
    expect((await app.inject(`/api/memories/${item.id}`)).statusCode).toBe(404);
    const lease = database.acquire();
    try {
      expect(lease.db.prepare("SELECT count(*) AS n FROM memory_fts WHERE memory_fts MATCH ?").get("uniquememoryftstoken")).toEqual({ n: 0 });
      expect(lease.orm.select().from(provenance).all().some(p => p.derivedId === item.id)).toBe(false);
    } finally { lease.release(); }
  });

  it("fails closed on foreign IDs/cursors/sources and rolls back provenance atomically", async () => {
    const { app, database, memory, pool } = await fixture();
    const lease = database.acquire();
    const other = uuidv7() as UserId;
    let foreign!: ReturnType<MemoryRepository["create"]>;
    let source!: ReturnType<DiaryRepository["create"]>;
    try {
      const now = new Date().toISOString();
      lease.orm.insert(users).values({ userId: other, createdAt: now }).run();
      lease.orm.insert(settings).values({ userId: other, updatedAt: now }).run();
      source = new DiaryRepository(lease).create(other, { origin: "manual", content: "FOREIGNCANARY", accessLevel: "ai_eligible" });
      foreign = new MemoryRepository(lease).create(other, { origin: "ai_proposal", content: "FOREIGNCANARY", accessLevel: "ai_eligible", sources: [{ sourceType: "diary_entry", sourceId: source.id }] });
      expect(await new SqlChatStore(lease).reads.listMemoryCandidates({ userId: lease.userId, limit: 100 })).toEqual([]);
    } finally { lease.release(); }
    const base = `/api/memories/${foreign.id}`;
    for (const res of [await app.inject(base), await app.inject({ method: "PATCH", url: base, payload: { content: "bad" } }), await app.inject({ method: "DELETE", url: base }), await app.inject({ method: "POST", url: `${base}/review`, payload: { status: "approved" } }), await app.inject(`/api/memories?cursor=${foreign.id}`)]) {
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain("FOREIGNCANARY");
    }
    expect((await memory({ origin: "user", content: "rollback", accessLevel: "ai_eligible", sources: [...manual, { sourceType: "diary_entry", sourceId: source.id }] })).statusCode).toBe(404);
    expect((await memory({ origin: "user", content: "rollback", accessLevel: "private", sources: [{ sourceType: "message", sourceId: uuidv7() }] })).statusCode).toBe(404);
    expect((await app.inject("/api/memories")).json().memories).toEqual([]);
    expect(await pool()).toEqual([]);
    const inspect = database.acquire();
    try {
      expect(new MemoryRepository(inspect).get(other, foreign.id)).toEqual(foreign);
      expect(inspect.orm.select().from(provenance).all()).toHaveLength(1);
    } finally { inspect.release(); }
  });

  it("clamps source permissions, propagates transitive revocation durably and requires explicit re-confirmation", async () => {
    const { diary, memory, patch, app, database, pool } = await fixture();
    const source = (await diary({ origin: "manual", content: "chem source" })).json();
    const derived = (await diary({ origin: "excerpt", content: "chem derived", accessLevel: "ai_eligible", sources: [{ sourceType: "diary_entry", sourceId: source.id }] })).json();
    expect(derived.accessLevel).toBe("private");
    const item = (await memory({ origin: "user", content: "chem memory", accessLevel: "ai_eligible", sources: [{ sourceType: "diary_entry", sourceId: derived.id }] })).json();
    expect(item.accessLevel).toBe("private");
    expect((await patch(`/api/memories/${item.id}`, { accessLevel: "ai_eligible" })).statusCode).toBe(409);
    await patch(`/api/diary/${source.id}`, { accessLevel: "ai_eligible" });
    await patch(`/api/diary/${derived.id}`, { accessLevel: "ai_eligible" });
    expect((await patch(`/api/memories/${item.id}`, { accessLevel: "ai_eligible" })).statusCode).toBe(200);
    expect(await pool()).toHaveLength(1);
    await patch(`/api/diary/${source.id}`, { accessLevel: "private" });
    expect((await app.inject(`/api/diary/${derived.id}`)).json().accessLevel).toBe("private");
    expect((await app.inject(`/api/memories/${item.id}`)).json().accessLevel).toBe("private");
    await database.lock();
    await database.unlock(secret);
    await patch(`/api/diary/${source.id}`, { accessLevel: "ai_eligible" });
    expect(await pool()).toEqual([]);
    expect((await patch(`/api/memories/${item.id}`, { accessLevel: "ai_eligible" })).statusCode).toBe(409);
    await patch(`/api/diary/${derived.id}`, { accessLevel: "ai_eligible" });
    await patch(`/api/memories/${item.id}`, { accessLevel: "ai_eligible" });
    expect(await pool()).toHaveLength(1);
    await app.inject({ method: "DELETE", url: `/api/diary/${source.id}` });
    expect(await pool()).toEqual([]);
    expect((await patch(`/api/diary/${derived.id}`, { accessLevel: "ai_eligible" })).statusCode).toBe(409);
    const lease = database.acquire();
    try {
      expect(lease.orm.select().from(provenance).all().some(p => p.sourceId === source.id)).toBe(true);
      const revoked = lease.db.prepare("SELECT entity_id, reason FROM tombstones WHERE user_id=?").all(lease.userId);
      expect(revoked).toEqual(expect.arrayContaining([expect.objectContaining({ entity_id: item.id, reason: "access_revoked" })]));
    } finally { lease.release(); }
  });

  it("follows reply context provenance through revocation, rejection and conversation deletion", async () => {
    const { memory, diary, chat, patch, app, pool } = await fixture();
    const source = (await memory({ origin: "ai_proposal", content: "chem root", accessLevel: "ai_eligible", sources: manual })).json();
    await app.inject({ method: "POST", url: `/api/memories/${source.id}/review`, payload: { status: "approved" } });
    const first = events((await chat("chem FIRSTQUESTION")).body);
    const conversationId = first.find(e => e.name === "meta")!.data.conversationId;
    const replyId = first.find(e => e.name === "done")!.data.assistantMessageId;
    const item = (await memory({ origin: "user", content: "chem reply-derived", accessLevel: "ai_eligible", sources: [{ sourceType: "message", sourceId: replyId }] })).json();
    const excerpt = (await diary({ origin: "excerpt", content: "chem reply excerpt", accessLevel: "ai_eligible", sources: [{ sourceType: "message", sourceId: replyId }] })).json();
    expect(item.accessLevel).toBe("ai_eligible");
    expect(excerpt.accessLevel).toBe("ai_eligible");
    await app.inject({ method: "POST", url: `/api/memories/${source.id}/review`, payload: { status: "rejected" } });
    expect(await pool()).toEqual([]);
    expect((await app.inject(`/api/diary/${excerpt.id}`)).json().accessLevel).toBe("private");
    expect((await patch(`/api/memories/${item.id}`, { accessLevel: "ai_eligible" })).statusCode).toBe(409);
    await app.inject({ method: "POST", url: `/api/memories/${source.id}/review`, payload: { status: "approved" } });
    expect((await pool()).map(m => m.id)).toEqual([source.id]);
    await patch(`/api/memories/${item.id}`, { accessLevel: "ai_eligible" });
    expect(await pool()).toHaveLength(2);
    await app.inject({ method: "DELETE", url: `/api/conversations/${conversationId}` });
    expect((await pool()).map(m => m.id)).toEqual([source.id]);
    expect((await patch(`/api/memories/${item.id}`, { accessLevel: "ai_eligible" })).statusCode).toBe(409);
  });

  it("supports explicit user-message sources and invalidates reply-derived items when a memory is hidden or deleted", async () => {
    const { memory, chat, patch, app, pool } = await fixture();
    const source = (await memory({ origin: "user", content: "chem root", accessLevel: "ai_eligible", sources: manual })).json();
    const turn = events((await chat("chem FIRSTQUESTION")).body);
    const userId = turn.find(e => e.name === "meta")!.data.userMessageId;
    const replyId = turn.find(e => e.name === "done")!.data.assistantMessageId;
    const direct = (await memory({ origin: "user", content: "direct user-source fixture", accessLevel: "ai_eligible", sources: [{ sourceType: "message", sourceId: userId }] })).json();
    const derived = (await memory({ origin: "user", content: "reply-source fixture", accessLevel: "ai_eligible", sources: [{ sourceType: "message", sourceId: replyId }] })).json();
    await patch(`/api/memories/${source.id}`, { accessLevel: "private" });
    expect((await pool()).map(m => m.id)).toEqual([direct.id]);
    expect((await patch(`/api/memories/${derived.id}`, { accessLevel: "ai_eligible" })).statusCode).toBe(409);
    await patch(`/api/memories/${source.id}`, { accessLevel: "ai_eligible" });
    await patch(`/api/memories/${derived.id}`, { accessLevel: "ai_eligible" });
    expect(await pool()).toHaveLength(3);
    await app.inject({ method: "DELETE", url: `/api/memories/${source.id}` });
    expect((await pool()).map(m => m.id)).toEqual([direct.id]);
    expect((await patch(`/api/memories/${derived.id}`, { accessLevel: "ai_eligible" })).statusCode).toBe(409);
  });

  it("excludes the entire tainted exchange from the assembled prompt even with Use memories off", async () => {
    const { diary, memory, chat, patch, provider } = await fixture();
    const source = (await diary({ origin: "manual", content: "chem SOURCETEXTCANARY", accessLevel: "ai_eligible" })).json();
    const derived = (await memory({ origin: "user", content: "chem DERIVEDTEXTCANARY", accessLevel: "ai_eligible", sources: [{ sourceType: "diary_entry", sourceId: source.id }] })).json();
    const first = events((await chat("chem FIRSTQUESTION")).body);
    const id = first.find(e => e.name === "meta")!.data.conversationId;
    expect(first.find(e => e.name === "context")!.data.sources.map((s: { id: string }) => s.id)).toEqual(expect.arrayContaining([source.id, derived.id]));
    await patch(`/api/diary/${source.id}`, { accessLevel: "private" });
    const next = events((await chat("continue", id, false)).body);
    expect(next.find(e => e.name === "historyExcluded")!.data.count).toBe(1);
    const prompt = JSON.stringify(provider.prompts.at(-1));
    expect(prompt).not.toMatch(/SOURCETEXTCANARY|DERIVEDTEXTCANARY|FIRSTQUESTION|FIRSTREPLYCANARY/);
    expect(next.find(e => e.name === "context")!.data.sources).toEqual([]);
    await patch(`/api/diary/${source.id}`, { accessLevel: "ai_eligible" });
    // The derived memory is still private, so the original exchange remains tainted.
    expect(events((await chat("chem", id)).body).some(e => e.name === "historyExcluded")).toBe(true);
    expect(JSON.stringify(provider.prompts.at(-1))).not.toMatch(/FIRSTQUESTION|FIRSTREPLYCANARY|DERIVEDTEXTCANARY/);
  });

  it("sends every eligible memory with pins first, bounded diary, exact source IDs/sent text (D49)", async () => {
    const { memory, diary, chat, provider, app } = await fixture();
    const eligible: string[] = [];
    for (let i = 0; i < 7; i++) eligible.push((await memory({ origin: "user", content: `chem fixture ${i}`, accessLevel: "ai_eligible", sources: manual })).json().id);
    const pinned = (await memory({ origin: "user", content: "unrelated hand-picked fixture", accessLevel: "ai_eligible", sources: manual })).json();
    const hidden = (await memory({ origin: "user", content: "chem PRIVATEMEMORYCANARY", accessLevel: "private", sources: manual })).json();
    const proposed = (await memory({ origin: "ai_proposal", content: "chem PROPOSEDMEMORYCANARY", accessLevel: "ai_eligible", sources: manual })).json();
    const deleted = (await diary({ origin: "manual", content: "chem DELETEDDIARYCANARY", accessLevel: "ai_eligible" })).json();
    await app.inject({ method: "DELETE", url: `/api/diary/${deleted.id}` });
    for (let i = 0; i < 4; i++) await diary({ origin: "manual", content: `chem diary ${i}`, accessLevel: "ai_eligible" });
    const turn = events((await chat("chem", null, true, [pinned.id, hidden.id, proposed.id])).body);
    const sources = turn.find(e => e.name === "context")!.data.sources as { id: string; type: string }[];
    expect(sources.filter(s => s.type === "memory")).toHaveLength(8); // D49: all 7 eligible + the pin, never private/proposed
    expect(sources.filter(s => s.type === "diary_entry")).toHaveLength(4); // every eligible entry, under the cap of 6
    expect(sources[0]!.id).toBe(pinned.id);
    expect(sources.filter(s => s.type === "memory" && s.id !== pinned.id).every(s => eligible.includes(s.id))).toBe(true);
    const prompt = JSON.stringify(provider.prompts.at(-1));
    expect(prompt).not.toMatch(/PRIVATEMEMORYCANARY|PROPOSEDMEMORYCANARY|DELETEDDIARYCANARY/);
    for (const source of sources) expect(prompt).toContain(source.id);
    const sent = turn.find(e => e.name === "context")!.data.sent as { id: string; text: string }[];
    expect(sent.map(s => s.id)).toEqual(sources.map(s => s.id));
    for (const item of sent) expect(provider.prompts.at(-1)![0]!.content).toContain(item.text);
    const off = events((await chat("chem", null, false, [pinned.id])).body);
    expect(off.find(e => e.name === "context")!.data.sources).toEqual([]);
    expect(JSON.stringify(provider.prompts.at(-1))).not.toContain(pinned.content);
  });

  it("temporary SQL memory retrieval writes no table and logs no content", async () => {
    const { database, app, memory, logs } = await fixture();
    await memory({ origin: "user", content: "chem MEMORYINPUTCANARY", accessLevel: "ai_eligible", sources: manual });
    const snapshot = () => { const lease = database.acquire(); try {
      const tables = lease.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
      return tables.map(({ name }) => [name, lease.db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()]);
    } finally { lease.release(); } };
    const before = snapshot();
    const turn = events((await app.inject({ method: "POST", url: "/api/infer", payload: { history: [], message: "chem FIRSTQUESTION", useMemories: true } })).body);
    expect(turn.find(e => e.name === "context")!.data.sources).toHaveLength(1);
    expect(turn.at(-1)!.name).toBe("done");
    expect(snapshot()).toEqual(before);
    expect(logs.join("")).not.toMatch(/MEMORYINPUTCANARY|FIRSTQUESTION|FIRSTREPLYCANARY/);
  });

  it("rejects all memory endpoints while locked and reopens persisted status/provenance", async () => {
    const { app, database, memory, pool } = await fixture();
    const item = (await memory({ origin: "user", content: "chem persisted", accessLevel: "ai_eligible", sources: manual })).json();
    await database.lock();
    const base = `/api/memories/${item.id}`;
    for (const request of [app.inject("/api/memories"), app.inject(base), app.inject({ method: "POST", url: "/api/memories", payload: {} }), app.inject({ method: "PATCH", url: base, payload: {} }), app.inject({ method: "DELETE", url: base }), app.inject({ method: "POST", url: `${base}/review`, payload: { status: "approved" } })]) expect((await request).statusCode).toBe(423);
    await database.unlock(secret);
    expect((await app.inject(base)).json()).toEqual(item);
    expect((await pool()).map(m => m.id)).toEqual([item.id]);
    const lease = database.acquire();
    try {
      expect(lease.orm.select().from(provenance).all()).toMatchObject([{ derivedId: item.id, sourceType: "manual", sourceId: null }]);
      // Read ports reject attempts to switch users despite a valid lease.
      await expect(new SqlChatStore(lease).reads.listMemoryCandidates({ userId: uuidv7() as UserId, limit: 10 })).rejects.toThrow();
      expect(new ConversationRepository(lease).list(lease.userId, 10).conversations).toEqual([]);
    } finally { lease.release(); }
  });
});
