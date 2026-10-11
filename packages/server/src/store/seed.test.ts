import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fromRoot } from "../paths.js";
import { DatabaseStore } from "./db.js";
import { seedFictionalPersona } from "./seed.js";
import { SqlChatStore } from "./chat-store.js";
import { DiaryRepository } from "./repos/diary.js";
import { settings, users } from "./schema.js";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const f of cleanup.splice(0)) await f(); });
const template = JSON.parse(readFileSync(fromRoot("docs/prep/demo-persona.json"), "utf8"));
async function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-seed-"));
  const database = new DatabaseStore(path.join(dir, "fixture.db"));
  await database.setup("fictional-seed-passphrase");
  cleanup.push(async () => { await database.shutdown(); rmSync(dir, { recursive: true, force: true }); });
  return database;
}

describe("B's opt-in SQL fictional persona seed", () => {
  it("seeds exactly the existing fixture with its dates/privacy and manual provenance; no live-demo/crisis instructions", async () => {
    const database = await fixture(); const lease = database.acquire();
    try {
      const before = { users: lease.orm.select().from(users).all(), settings: lease.orm.select().from(settings).all() };
      expect(seedFictionalPersona(lease, template)).toEqual({ memories: 4, diaryEntries: 8 });
      const diary = new DiaryRepository(lease).list(lease.userId, 100).entries;
      expect(diary.map(d => d.createdAt).sort()).toEqual(template.diaryEntries.map((d: { date: string }) => `${d.date}T12:00:00.000Z`).sort());
      for (const input of template.diaryEntries) expect(diary).toContainEqual(expect.objectContaining({ content: input.content, accessLevel: input.accessLevel, title: input.title }));
      expect(diary.map(d => d.title)).not.toContain(template.demoLive.entryA.title);
      expect(lease.orm.select().from(users).all()).toEqual(before.users);
      expect(lease.orm.select().from(settings).all()).toEqual(before.settings);
      const pool = await new SqlChatStore(lease).reads.listMemoryCandidates({ userId: lease.userId, limit: 100 });
      expect(pool).toHaveLength(3);
      expect(pool.every(m => m.status === "approved" && m.provenance.every(p => p.sourceType === "manual" && p.sourceId === null))).toBe(true);
      expect(lease.db.prepare("SELECT count(*) AS n FROM conversations WHERE user_id=?").get(lease.userId)).toEqual({ n: 0 });
    } finally { lease.release(); }
    await database.lock(); await database.unlock("fictional-seed-passphrase");
    const reopened = database.acquire(); try { expect(new DiaryRepository(reopened).list(reopened.userId, 100).entries).toHaveLength(8); } finally { reopened.release(); }
  });
  it("refuses repeated/nonempty seeding without modifying existing private records", async () => {
    const database = await fixture(); const lease = database.acquire();
    try {
      const existing = new DiaryRepository(lease).create(lease.userId, { origin: "manual", content: "fictional existing private content" });
      expect(() => seedFictionalPersona(lease, template)).toThrow("empty content store");
      expect(new DiaryRepository(lease).get(lease.userId, existing.id)).toEqual(existing);
      expect(lease.db.prepare("SELECT count(*) AS n FROM memories WHERE user_id=?").get(lease.userId)).toEqual({ n: 0 });
    } finally { lease.release(); }
    await database.deleteAll();
    const empty = database.acquire(); try {
      seedFictionalPersona(empty, template);
      expect(() => seedFictionalPersona(empty, template)).toThrow("empty content store");
      expect(new DiaryRepository(empty).list(empty.userId, 100).entries).toHaveLength(8);
    } finally { empty.release(); }
  });
  it("validates the entire fixture before writing; a failed insert rolls back nested repository writes", async () => {
    const database = await fixture(); const lease = database.acquire();
    try {
      expect(() => seedFictionalPersona(lease, { ...template, diaryEntries: [...template.diaryEntries, { ...template.diaryEntries[0], date: "2026-02-30" }] })).toThrow();
      expect(lease.db.prepare("SELECT count(*) AS n FROM memories WHERE user_id=?").get(lease.userId)).toEqual({ n: 0 });
      lease.db.exec("CREATE TRIGGER fixture_seed_failure BEFORE INSERT ON diary_entries BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
      expect(() => seedFictionalPersona(lease, template)).toThrow();
      expect(lease.db.prepare("SELECT count(*) AS n FROM memories WHERE user_id=?").get(lease.userId)).toEqual({ n: 0 });
      expect(lease.db.prepare("SELECT count(*) AS n FROM provenance WHERE user_id=?").get(lease.userId)).toEqual({ n: 0 });
    } finally { lease.release(); }
  });
});
