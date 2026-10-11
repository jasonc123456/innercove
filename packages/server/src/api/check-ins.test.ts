import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Writable } from "node:stream";
import { checkInDay, treeStage, UserIdSchema, type CheckInMood } from "@innercove/core";
import { buildApp } from "../app.js";
import { FakeProvider } from "../inference/index.js";
import { noSafety } from "../chat/safety.js";
import { DatabaseStore } from "../store/db.js";
import { CheckInRepository } from "../store/repos/check-ins.js";
import { DiaryRepository } from "../store/repos/diary.js";
import { uuidv7 } from "../store/repos/common.js";
import { seedFictionalPersona } from "../store/seed.js";

const cleanups: (() => Promise<void>)[] = [];
const secret = "fictional-tree-test-passphrase";
afterEach(async () => { vi.useRealTimers(); for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "innercove-tree-"));
  const file = path.join(dir, "encrypted.db"); const database = new DatabaseStore(file);
  await database.setup(secret);
  const provider = new FakeProvider(); const logs: string[] = [];
  const stream = new Writable({ write(chunk, _encoding, done) { logs.push(String(chunk)); done(); } });
  const app = await buildApp({ database, provider, safety: noSafety, systemPrompt: "SYSTEM", stats: { lastReply: null } }, { level: "info", stream });
  cleanups.push(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  const login = async () => {
    const result = await app.inject({ method: "POST", url: "/api/session", payload: { login: "admin", passphrase: secret } });
    expect(result.statusCode).toBe(200);
    return { cookie: String(result.headers['set-cookie']).split(';')[0]! };
  };
  const headers = await login();
  const save = (mood: CheckInMood, eventId = uuidv7(), timeZone = "America/Los_Angeles") => app.inject({ method: "POST", url: "/api/check-ins", headers, payload: { mood, eventId, timeZone } });
  return { app, database, file, headers, save, login, logs, provider };
}
function historical(lease: ReturnType<DatabaseStore['acquire']>, days: number, repeats = 1) {
  for (let i = 0; i < days; i++) for (let j = 0; j < repeats; j++) {
    const at = new Date(Date.UTC(2026, 0, i + 1, 12)).toISOString();
    lease.db.prepare("INSERT INTO check_in_events(user_id,event_id,day,mood,time_zone,recorded_at) VALUES(?,?,?,?,?,?)").run(lease.userId, uuidv7(), at.slice(0,10), j % 2 ? "low" : "bright", "America/Los_Angeles", at);
  }
}
describe('daily leaves, encryption and evolution', () => {
  it('updates one daily leaf, preserves mood history and makes retries idempotent', async () => {
    const f = await fixture(); const id = uuidv7();
    const first = (await f.save('bright', id)).json(); expect(first.days).toHaveLength(1);
    const changed = (await f.save('low')).json(); expect(changed.days).toHaveLength(1); expect(changed.days[0].mood).toBe('low');
    expect(changed.days[0].createdAt).toBe(first.days[0].createdAt); expect(changed.pendingStage).toBeNull();
    const replay = (await f.save('bright', id)).json(); expect(replay.days[0].mood).toBe('low');
    expect((await f.save('heavy', id)).statusCode).toBe(409);
    const lease = f.database.acquire();
    expect(lease.db.prepare('SELECT count(*) n FROM check_in_events').get()).toEqual({ n: 2 });
    expect(() => lease.db.prepare('INSERT INTO daily_check_ins SELECT * FROM daily_check_ins').run()).toThrow();
    lease.release();
  });
  it('serializes concurrent requests and second-connection writes without duplicate leaves', async () => {
    const f = await fixture(); const id = uuidv7();
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => f.save(i % 2 ? 'low' : 'bright')));
    expect(results.every(r => r.statusCode === 200 && r.json().days.length === 1)).toBe(true);
    await Promise.all([f.save('calm',id),f.save('calm',id),f.save('calm',id)]);
    const other = new DatabaseStore(f.file); await other.unlock(secret);
    const lease = other.acquire();
    try { expect(new CheckInRepository(lease).save(lease.userId, { eventId: uuidv7(), mood: 'heavy', timeZone: 'America/Los_Angeles' }).days).toHaveLength(1); }
    finally { lease.release(); await other.shutdown(); }
    expect((await f.app.inject({ url:'/api/check-ins?timeZone=America%2FLos_Angeles',headers:f.headers })).json().days[0].mood).toBe('heavy');
  });
  it('uses local midnight, handles DST and ignores client-supplied dates', async () => {
    const f = await fixture(); const lease = f.database.acquire(); let now = new Date('2026-10-11T06:59:59Z');
    const repo = new CheckInRepository(lease,()=>now); const id=uuidv7();
    const before = repo.save(lease.userId,{eventId:id,mood:'bright',timeZone:'America/Los_Angeles'});
    expect(before.today).toBe('2026-10-10');
    now = new Date('2026-10-11T07:00:00Z');
    expect(repo.save(lease.userId,{eventId:id,mood:'bright',timeZone:'America/Los_Angeles'}).days).toHaveLength(1); // midnight retry stays original event
    expect(repo.save(lease.userId,{eventId:uuidv7(),mood:'calm',timeZone:'America/Los_Angeles'}).days.map(d=>d.day)).toEqual(['2026-10-10','2026-10-11']);
    expect(checkInDay(new Date('2026-11-01T08:30:00Z'),'America/Los_Angeles')).toBe(checkInDay(new Date('2026-11-01T09:30:00Z'),'America/Los_Angeles'));
    expect(checkInDay(new Date('2026-10-10T23:30:00Z'),'Asia/Tokyo')).toBe('2026-10-11');
    lease.release();
    expect((await f.app.inject({method:'POST',url:'/api/check-ins',headers:f.headers,payload:{eventId:uuidv7(),mood:'calm',timeZone:'America/Los_Angeles',day:'2030-01-01'}})).statusCode).toBe(400);
  });
  it('folds historical duplicate moods into latest-color daily leaves without losing history or replaying backlog', async () => {
    const f = await fixture(); const lease = f.database.acquire(); historical(lease,35,4);
    const result = new CheckInRepository(lease).list(lease.userId,'America/Los_Angeles');
    expect(result.days).toHaveLength(35); expect(result.days.every(d=>d.mood==='low')).toBe(true);
    expect(result).toMatchObject({stage:3,acknowledgedStage:3,pendingStage:null});
    expect(lease.db.prepare('SELECT count(*) n FROM check_in_events').get()).toEqual({n:140});
    lease.release();
  });
  it.each([[13,2],[29,3]] as const)('celebrates %i → next stage once and persists Continue through reopen/sign-in', async (count,nextStage) => {
    const f = await fixture(); const lease = f.database.acquire(); historical(lease,count,2);
    const repo = new CheckInRepository(lease);
    expect(repo.list(lease.userId,'America/Los_Angeles').pendingStage).toBeNull();
    lease.release();
    const crossed=(await f.save('heavy')).json(); expect(crossed).toMatchObject({stage:nextStage,pendingStage:nextStage}); expect(crossed.days).toHaveLength(count+1);
    expect((await f.save('low')).json().days).toHaveLength(count+1);
    await f.database.lock(); await f.database.unlock(secret);
    const headers=await f.login();
    expect((await f.app.inject({url:'/api/check-ins?timeZone=America%2FLos_Angeles',headers})).json().pendingStage).toBe(nextStage);
    expect((await f.app.inject({method:'POST',url:'/api/check-ins/evolution/acknowledge',headers,payload:{stage:nextStage,timeZone:'America/Los_Angeles'}})).json().pendingStage).toBeNull();
    await f.database.lock(); await f.database.unlock(secret);
    const freshHeaders=await f.login();
    expect((await f.app.inject({url:'/api/check-ins?timeZone=America%2FLos_Angeles',headers:freshHeaders})).json()).toMatchObject({stage:nextStage,pendingStage:null});
  });
  it('blocks premature acknowledgement and validates mood/zone with real session and lock gates', async () => {
    const f=await fixture();
    expect((await f.app.inject('/api/check-ins?timeZone=America%2FLos_Angeles')).statusCode).toBe(401);
    expect((await f.app.inject({method:'POST',url:'/api/check-ins/evolution/acknowledge',headers:f.headers,payload:{stage:3,timeZone:'America/Los_Angeles'}})).statusCode).toBe(400);
    for(const payload of [{eventId:uuidv7(),mood:'happy',timeZone:'America/Los_Angeles'},{eventId:uuidv7(),mood:'low',timeZone:'invalid-zone'}]) expect((await f.app.inject({method:'POST',url:'/api/check-ins',headers:f.headers,payload})).statusCode).toBe(400);
    await f.database.lock();
    expect((await f.save('calm')).statusCode).toBe(423);
  });
  it('retains encrypted progress, keeps it out of prompts/logs, and delete-all removes moods and acknowledgement', async () => {
    const f=await fixture(); await f.save('heavy'); const lease=f.database.acquire();
    const userId=lease.userId;
    expect(() => seedFictionalPersona(lease,JSON.parse(readFileSync(path.resolve('docs/prep/demo-persona.json'),'utf8')))).toThrow('empty content store');
    lease.release(); await f.database.lock(); await f.database.unlock(secret);
    const reopened=f.database.acquire(); expect(new CheckInRepository(reopened).list(userId,'America/Los_Angeles').days).toHaveLength(1); reopened.release();
    expect(readFileSync(f.file).subarray(0,16).toString()).not.toBe('SQLite format 3\0');
    const headers=await f.login();
    const chat=await f.app.inject({method:'POST',url:'/api/infer',headers,payload:{history:[],message:'fictional greeting',useMemories:false,pinnedMemoryIds:[]}});
    expect(chat.statusCode).toBe(200); expect(f.provider.prompts.length).toBeGreaterThan(0);
    expect(JSON.stringify(f.provider.prompts)).not.toContain('heavy'); expect(f.logs.join('')).not.toContain('"mood"'); expect(f.logs.join('')).not.toContain('heavy');
    const reset=await f.app.inject({method:'POST',url:'/api/delete-all',headers,payload:{confirm:"DELETE"}}); expect(reset.statusCode).toBe(200);
    const empty=f.database.acquire();
    for(const table of ['daily_check_ins','check_in_events','tree_progress']) expect(empty.db.prepare(`SELECT count(*) n FROM ${table}`).get()).toEqual({n:0});
    empty.release();
  });
  it('scopes daily count, mood history and acknowledgement to the authenticated user', async () => {
    const f=await fixture(); const lease=f.database.acquire(); const other=UserIdSchema.parse(uuidv7());
    lease.db.prepare('INSERT INTO users(user_id,created_at) VALUES(?,?)').run(other,new Date().toISOString());
    const repo=new CheckInRepository(lease);
    repo.save(other,{eventId:uuidv7(),mood:'low',timeZone:'Asia/Tokyo'});
    expect(repo.list(lease.userId,'America/Los_Angeles')).toMatchObject({days:[],stage:1,pendingStage:null});
    expect(repo.list(other,'Asia/Tokyo').days).toHaveLength(1);
    lease.release();
    expect((await f.app.inject({url:`/api/check-ins?timeZone=Asia%2FTokyo&userId=${other}`,headers:f.headers})).statusCode).toBe(400);
  });
  it('migrates an older encrypted hub without changing diary data or inventing daily history', async () => {
    const f=await fixture();const lease=f.database.acquire();const diary=new DiaryRepository(lease).create(lease.userId,{origin:'manual',content:'fictional preserved entry'});
    lease.db.exec('DROP TABLE tree_progress; DROP TABLE daily_check_ins; DROP TABLE check_in_events; DELETE FROM __drizzle_migrations WHERE created_at=1791763200001');
    lease.release();await f.database.lock();await f.database.unlock(secret);
    const updated=f.database.acquire();
    expect(new DiaryRepository(updated).get(updated.userId,diary.id).content).toBe('fictional preserved entry');
    expect(new CheckInRepository(updated).list(updated.userId,'America/Los_Angeles').days).toEqual([]);updated.release();
  });
});
it('keeps thresholds centralized and counts unique days, not moods',()=>{
  expect([0,13,14,29,30,1000].map(treeStage)).toEqual([1,1,2,2,3,3]);
});
