import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseStore } from "../dist/store/db.js";

// Real compiled entrypoint, loopback HTTP, temporary encrypted database and
// SIGTERM shutdown. No LM Studio, real content or existing ./data involved.
const dir = mkdtempSync(path.join(tmpdir(), "innercove-runtime-smoke-"));
const file = path.join(dir, "test.db");
const passphrase = "fixture-only-runtime-passphrase";
const cwd = fileURLToPath(new URL("../", import.meta.url));
function launch(encryption = "sqlcipher") {
  const child = spawn(process.execPath, ["dist/main.js"], { cwd, env: {
    ...process.env, INFERENCE_PROVIDER: "fake", NODE_ENV: "test", HOST: "127.0.0.1", PORT: "0",
    DB_PATH: file, DB_ENCRYPTION: encryption, DEV_STORE: "demo", WEB_DIST: path.join(dir, "no-web"),
  }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const exited = new Promise((resolve, reject) => {
    child.once("error", reject); child.once("close", (code) => resolve(code));
  });
  return { child, exited, output: () => output };
}
let running;
let reopened;
try {
  running = launch();
  const address = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server readiness timed out")), 10000);
    running.child.stdout.on("data", () => {
      const match = /Server listening at (http:\/\/127\.0\.0\.1:\d+)/.exec(running.output());
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    running.child.once("close", () => { clearTimeout(timer); reject(new Error("Server exited before readiness")); });
  });
  async function call(method, route, payload, expected) {
    const response = await fetch(address + route, { method,
      ...(payload ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}),
    });
    assert.equal(response.status, expected, `${method} ${route}`);
    return response.json();
  }
  assert.equal((await call("GET", "/api/health", undefined, 200)).locked, true);
  assert.deepEqual(await call("GET", "/api/lock-status", undefined, 200), { hasPassphrase: false, locked: true });
  await call("POST", "/api/infer", { history: [], message: "fixture" }, 423);
  assert.deepEqual(await call("POST", "/api/setup", { passphrase }, 201), { locked: false });
  assert.deepEqual(await call("POST", "/api/lock", undefined, 200), { locked: true });
  await call("POST", "/api/unlock", { passphrase: "wrong-fixture" }, 401);
  assert.deepEqual(await call("POST", "/api/unlock", { passphrase }, 200), { locked: false });
  // Production Phase 2 paths: the legacy demo flag must not select volatile
  // persistence, and these HTTP requests use the real compiled registration.
  const diary = await call("POST", "/api/diary", { origin: "manual", content: "runtimefixturetoken" }, 201);
  assert.equal(diary.accessLevel, "private");
  assert.equal((await call("GET", "/api/diary?q=runtimefixturetoken", undefined, 200)).entries[0].id, diary.id);
  const saved = await fetch(address + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId: null, message: "fixture question", useMemories: false, pinnedMemoryIds: [] }) });
  assert.equal(saved.status, 200);
  const sse = await saved.text();
  const meta = JSON.parse(/event: meta\ndata: (.+)/.exec(sse)[1]);
  assert.match(sse, /event: done/);
  const loaded = await call("GET", `/api/conversations/${meta.conversationId}/messages`, undefined, 200);
  assert.deepEqual(loaded.messages.map(message => message.role), ["user", "assistant"]);
  await call("PATCH", `/api/diary/${diary.id}`, { content: "updatedruntimefixture" }, 200);
  assert.equal((await call("GET", "/api/diary?q=runtimefixturetoken", undefined, 200)).entries.length, 0);
  await call("DELETE", `/api/diary/${diary.id}`, undefined, 200);
  assert.equal((await call("GET", "/api/diary?q=updatedruntimefixture", undefined, 200)).entries.length, 0);
  // Phase 3 through compiled HTTP registration, using only fictional fixtures.
  const source = await call("POST", "/api/diary", { origin: "manual", content: "chem runtime source", accessLevel: "ai_eligible" }, 201);
  const memory = await call("POST", "/api/memories", { origin: "user", content: "chem runtime derived", accessLevel: "ai_eligible", sources: [{ sourceType: "diary_entry", sourceId: source.id }] }, 201);
  assert.equal(memory.status, "approved");
  const proposal = await call("POST", "/api/memories", { origin: "ai_proposal", content: "fictional proposal", accessLevel: "private", sources: [{ sourceType: "manual", sourceId: null }] }, 201);
  assert.equal(proposal.status, "proposed");
  assert.equal((await call("POST", `/api/memories/${proposal.id}/review`, { status: "approved" }, 200)).status, "approved");
  await call("POST", `/api/memories/${memory.id}/review`, { status: "rejected" }, 409);
  async function chatTurn(message, conversationId = null, useMemories = true) {
    const response = await fetch(address + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, message, useMemories, pinnedMemoryIds: [] }) });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /event: done/);
    return name => { const match = new RegExp(`event: ${name}\\ndata: (.+)`).exec(text); return match ? JSON.parse(match[1]) : null; };
  }
  const contextual = await chatTurn("chem");
  const contextIds = contextual("context").sources.map(item => item.id);
  assert.ok(contextIds.includes(source.id) && contextIds.includes(memory.id));
  await call("PATCH", `/api/diary/${source.id}`, { accessLevel: "private" }, 200);
  assert.equal((await call("GET", `/api/memories/${memory.id}`, undefined, 200)).accessLevel, "private");
  await call("PATCH", `/api/memories/${memory.id}`, { accessLevel: "ai_eligible" }, 409);
  const filtered = await chatTurn("continue", contextual("meta").conversationId, false);
  assert.equal(filtered("historyExcluded").count, 1);
  assert.deepEqual(filtered("context").sources, []);
  await call("PATCH", `/api/diary/${source.id}`, { accessLevel: "ai_eligible" }, 200);
  assert.equal((await call("GET", `/api/memories/${memory.id}`, undefined, 200)).accessLevel, "private");
  await call("PATCH", `/api/memories/${memory.id}`, { accessLevel: "ai_eligible" }, 200);
  await call("PATCH", `/api/diary/${source.id}`, { accessLevel: "private" }, 200);
  await call("DELETE", `/api/memories/${proposal.id}`, undefined, 200);
  const configured = await call("PATCH", "/api/settings", { useMemoriesDefault: false, diaryDefaultAccessLevel: "ai_eligible" }, 200);
  assert.equal(configured.useMemoriesDefault, false);
  await call("POST", "/api/delete-all", { confirm: "delete" }, 400);
  const counts = await call("POST", "/api/delete-all", { confirm: "DELETE" }, 200);
  assert.ok(counts.deleted.conversations >= 2 && counts.deleted.diaryEntries >= 1 && counts.deleted.memories >= 1);
  assert.deepEqual((await call("GET", "/api/diary?q=chem", undefined, 200)).entries, []);
  assert.deepEqual((await call("GET", "/api/memories", undefined, 200)).memories, []);
  assert.equal((await call("GET", "/api/settings", undefined, 200)).userId, configured.userId);
  const cleanTurn = await chatTurn("chem");
  assert.deepEqual(cleanTurn("context").sources, []);
  const cleanConversationId = cleanTurn("meta").conversationId;
  running.child.kill("SIGTERM");
  assert.equal(await running.exited, 0, "SIGTERM exit");
  assert.ok(!running.output().includes(passphrase), "credential absent from process output");
  assert.ok(!running.output().includes("runtimefixturetoken"), "diary text absent from process output");
  assert.ok(!running.output().includes("fixture question"), "chat text absent from process output");
  assert.ok(!running.output().includes("chem runtime"), "memory/source text absent from process output");
  reopened = new DatabaseStore(file);
  await reopened.unlock(passphrase);
  const lease = reopened.acquire();
  try {
    assert.equal(lease.db.prepare("SELECT count(*) n FROM __drizzle_migrations").get().n, 1);
    assert.ok(lease.db.prepare("SELECT user_id FROM settings WHERE user_id=?").get(lease.userId));
    assert.equal(lease.db.prepare("SELECT count(*) n FROM messages WHERE user_id=? AND conversation_id=?").get(lease.userId, meta.conversationId).n, 0);
    assert.equal(lease.db.prepare("SELECT count(*) n FROM messages WHERE user_id=? AND conversation_id=?").get(lease.userId, cleanConversationId).n, 2);
    assert.equal(lease.db.prepare("SELECT count(*) n FROM diary_entries WHERE user_id=? AND id=?").get(lease.userId, diary.id).n, 0);
    assert.equal(lease.db.prepare("SELECT count(*) n FROM memories WHERE user_id=?").get(lease.userId).n, 0);
    assert.equal(lease.db.prepare("SELECT use_memories_default FROM settings WHERE user_id=?").get(lease.userId).use_memories_default, 0);
    assert.equal(lease.db.prepare("SELECT count(*) n FROM provenance WHERE user_id=? AND derived_id=? AND source_id=?").get(lease.userId, memory.id, source.id).n, 0);
  } finally { lease.release(); }
  await reopened.shutdown();
  // Separate encrypted scratch database for the opt-in compiled seed CLI;
  // no running API shares this file. Credentials are stdin-only, never argv.
  const seedFile = path.join(dir, "seed.db");
  const seedStore = new DatabaseStore(seedFile);
  await seedStore.setup(passphrase); await seedStore.shutdown();
  async function seed(args, input = passphrase) {
    const child = spawn(process.execPath, ["scripts/seed-persona.mjs", ...args], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
    const exited = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    child.stdin.on("error", () => {}); child.stdin.end(input + "\n");
    const code = await exited; assert.ok(!output.includes(passphrase));
    return { code, output };
  }
  assert.equal((await seed(["--db", seedFile])).code, 1, "seed requires explicit fictional confirmation");
  assert.equal((await seed(["--db", seedFile, "--confirm-fictional"], "wrong-fixture")).code, 1, "seed rejects wrong key");
  const seeded = await seed(["--db", seedFile, "--confirm-fictional"]);
  assert.equal(seeded.code, 0); assert.deepEqual(JSON.parse(seeded.output), { seeded: { memories: 4, diaryEntries: 8 } });
  assert.equal((await seed(["--db", seedFile, "--confirm-fictional"])).code, 1, "seed refuses nonempty store");
  const seededStore = new DatabaseStore(seedFile); await seededStore.unlock(passphrase);
  const seededLease = seededStore.acquire();
  try { assert.equal(seededLease.db.prepare("SELECT count(*) n FROM diary_entries WHERE user_id=?").get(seededLease.userId).n, 8); }
  finally { seededLease.release(); await seededStore.shutdown(); }
  running = launch("off");
  assert.equal(await running.exited, 1, "plaintext mode explicitly rejected");
  assert.match(running.output(), /supports SQLCipher only/);
  console.log("PASS: compiled server setup/lock/unlock, diary CRUD/FTS, SQL saved chat/reopen (including legacy demo flag), memory CRUD/review/provenance, durable revocation/re-confirmation and D33 history, settings/delete-all/VACUUM/prompt cleanup, opt-in fictional seed CLI, packaged migrations, SIGTERM, plaintext rejection");
} finally {
  if (running && running.child.exitCode === null && running.child.signalCode === null) {
    running.child.kill("SIGTERM"); await running.exited;
  }
  await reopened?.shutdown();
  rmSync(dir, { recursive: true, force: true });
}
