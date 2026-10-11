#!/usr/bin/env node
/**
 * Phase 6 gate: runs the demo journey (plan "End-to-end verification") through the API
 * against a running, UNLOCKED hub, and cleans up what it creates. Node 22+, no deps.
 *
 *   node scripts/demo-check.mjs [BASE_URL] [--offline]
 *
 * BASE_URL defaults to http://127.0.0.1:8000 (the demo build, or Vite in dev mode).
 * --offline also requires the internet to be unreachable (run it with the network unplugged).
 * --delete-all also runs demo step 8: it ERASES ALL CONTENT ON THE HUB (D39), then checks a
 *   canary is gone from rows, search, memories and the next prompt. Use a throwaway hub.
 * It writes two fictional diary entries and one conversation, then deletes them
 * (content-free tombstones remain, as for any deletion).
 */
import { execFileSync } from "node:child_process";
import { connect } from "node:net";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const offline = args.includes("--offline");
const deleteAll = args.includes("--delete-all");
const base = (args.find((a) => !a.startsWith("--")) ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const tag = randomBytes(4).toString("hex");
let failures = 0;
const cleanup = [];

function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? `: ${detail}` : ""}`);
  return ok;
}

async function api(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

/** POSTs a chat turn and returns its SSE events as [{ name, data }]. */
async function turn(path, body) {
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.status !== 200) return { status: res.status, events: [] };
  const events = (await res.text())
    .split("\n\n")
    .filter(Boolean)
    .map((block) => ({
      name: /^event: (.+)$/m.exec(block)?.[1],
      data: JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? "null"),
    }));
  return { status: res.status, events };
}
const ev = (events, name) => events.find((e) => e.name === name)?.data;
const sourceIds = (events) => (ev(events, "context")?.sources ?? []).map((s) => s.id);

async function main() {
  console.log(`Demo check against ${base} (tag ${tag})`);
  const health = await api("GET", "/api/health");
  check("hub is up and the model is reachable", health.status === 200 && health.json?.model?.reachable, JSON.stringify(health.json?.model));
  const lock = await api("GET", "/api/lock-status");
  if (!check("hub is unlocked", lock.json?.locked === false, lock.json?.locked === false ? "" : "unlock it first (POST /api/unlock)")) return;

  // 1. Entries A and B; AI access for A only.
  const a = await api("POST", "/api/diary", {
    origin: "manual", title: `Chem midterm (demo ${tag})`, accessLevel: "ai_eligible",
    content: `The chem midterm went badly and I froze on the stoichiometry part. DEMO-A-${tag}`,
  });
  const b = await api("POST", "/api/diary", {
    origin: "manual", title: `Chem lab (demo ${tag})`, accessLevel: "private",
    content: `Private notes about the chem midterm retake plan. DEMO-B-${tag}`,
  });
  if (!check("create entry A (AI access) and B (private)", a.status === 201 && b.status === 201, `${a.status}/${b.status}`)) return;
  cleanup.push(() => api("DELETE", `/api/diary/${a.json.id}`), () => api("DELETE", `/api/diary/${b.json.id}`));

  // 2. Chat about both: chips show only A, and "what was sent" is exactly A's text.
  const first = await turn("/api/chat", { conversationId: null, message: "I'm still stressed about the chem midterm.", useMemories: true, pinnedMemoryIds: [] });
  const conversationId = ev(first.events, "meta")?.conversationId;
  if (conversationId) cleanup.unshift(() => api("DELETE", `/api/conversations/${conversationId}`));
  const ids = sourceIds(first.events);
  check("saved chat replies", first.status === 200 && !!ev(first.events, "done") && !!conversationId, `status ${first.status}`);
  check("chips include A and not B", ids.includes(a.json.id) && !ids.includes(b.json.id), `${ids.length} source(s)`);
  const sent = ev(first.events, "context")?.sent ?? [];
  check("'what was sent' shows A's text exactly", sent.some((s) => s.id === a.json.id && s.text.includes(`DEMO-A-${tag}`)));
  check("B's text was never sent", !JSON.stringify(first.events).includes(`DEMO-B-${tag}`));

  // 3. Hide A: next turn has neither A nor the earlier exchange that used it (D33), and says so.
  const hide = await api("PATCH", `/api/diary/${a.json.id}`, { accessLevel: "private" });
  check("hide A", hide.status === 200, `status ${hide.status}`);
  const second = await turn("/api/chat", { conversationId, message: "Anything else I should think about?", useMemories: true, pinnedMemoryIds: [] });
  check("after hiding, A is not in the chips", !sourceIds(second.events).includes(a.json.id));
  check("the earlier exchange is excluded, with a notice (D33)", (ev(second.events, "historyExcluded")?.count ?? 0) >= 1, JSON.stringify(ev(second.events, "historyExcluded") ?? null));
  check("the reply still arrives", !!ev(second.events, "done"));

  // 5. Temporary chat writes nothing (D35).
  const before = await api("GET", "/api/conversations");
  const temp = await turn("/api/infer", { history: [], message: "Quick temporary question about sleep.", useMemories: false, pinnedMemoryIds: [] });
  const after = await api("GET", "/api/conversations");
  check("temporary chat replies", !!ev(temp.events, "done"));
  check("temporary chat saves no conversation", JSON.stringify(before.json) === JSON.stringify(after.json));

  // 6. Crisis phrase: reviewed static reply, no model call (D32).
  const crisis = await turn("/api/infer", { history: [], message: "I have a plan and I think tonight is the night.", useMemories: false, pinnedMemoryIds: [] });
  check("crisis phrase gets tier 2 and the reviewed reply", ev(crisis.events, "meta")?.tier === 2 && ev(crisis.events, "done")?.modelId === "reviewed-reply");

  // 8. Delete-all (D39): a canary that was in rows, search, a memory and a prompt is gone from all of them.
  if (!deleteAll) {
    console.log("[SKIP] delete-all canary check (pass --delete-all; it erases all content on the hub)");
    return;
  }
  const canary = `CANARY${tag}`; // no hyphen: diary search treats "-" as FTS syntax (reported to B)
  const entry = await api("POST", "/api/diary", {
    origin: "manual", title: `Exam notes (demo ${tag})`, accessLevel: "ai_eligible",
    content: `The chem midterm review session helped a lot. ${canary}`,
  });
  const memory = entry.status === 201 ? await api("POST", "/api/memories", {
    origin: "user", accessLevel: "ai_eligible", content: `Finds chem midterm review sessions helpful. ${canary}`,
    sources: [{ sourceType: "diary_entry", sourceId: entry.json.id }],
  }) : { status: 0 };
  const sentBefore = await turn("/api/chat", { conversationId: null, message: "How should I prepare for the chem midterm?", useMemories: true, pinnedMemoryIds: [] });
  const searched = await api("GET", `/api/diary?q=${encodeURIComponent(canary)}`);
  check("before delete-all: canary entry and memory stored", entry.status === 201 && memory.status === 201, `${entry.status}/${memory.status}`);
  check("before delete-all: canary found by diary search", JSON.stringify(searched.json).includes(canary), `status ${searched.status}`);
  check("before delete-all: canary sent in a prompt", JSON.stringify(ev(sentBefore.events, "context")).includes(canary));
  const wiped = await api("POST", "/api/delete-all", { confirm: "DELETE" });
  check("delete-all succeeds", wiped.status === 200, JSON.stringify(wiped.json?.deleted ?? wiped.json));
  const wipedState = {
    diary: await api("GET", "/api/diary"),
    search: await api("GET", `/api/diary?q=${encodeURIComponent(canary)}`),
    memories: await api("GET", "/api/memories"),
    conversations: await api("GET", "/api/conversations"),
  };
  for (const [name, res] of Object.entries(wipedState)) {
    check(`after delete-all: canary gone from ${name}`, res.status === 200 && !JSON.stringify(res.json).includes(canary), `status ${res.status}`);
  }
  const next = await turn("/api/infer", { history: [], message: "How should I prepare for the chem midterm?", useMemories: true, pinnedMemoryIds: [] });
  check("after delete-all: the next prompt carries no canary", !!ev(next.events, "done") && !JSON.stringify(next.events).includes(canary));
  check("after delete-all: the hub stays unlocked (passphrase kept)", (await api("GET", "/api/lock-status")).json?.locked === false);
}

function listeners() {
  try {
    return execFileSync("ss", ["-ltnH"], { encoding: "utf8" })
      .split("\n").filter(Boolean).map((l) => l.trim().split(/\s+/)[3]);
  } catch { return null; }
}

function reachable(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 3000 });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

try {
  await main();
} catch (error) {
  check("journey ran without errors", false, error.message);
} finally {
  for (const undo of cleanup) await undo().catch(() => {});
  if (cleanup.length) console.log(`Cleaned up ${cleanup.length} item(s).`);
}

// 9. Ports: LM Studio loopback only; the app on loopback, or on the LAN when D46 is on.
const ports = listeners();
if (ports) {
  const on = (port) => ports.filter((p) => p.endsWith(`:${port}`));
  check("LM Studio (1234) listens on loopback only", on(1234).length > 0 && on(1234).every((p) => p.startsWith("127.0.0.1:") || p.startsWith("[::1]:")), on(1234).join(" "));
  check("API on 8001 (dev mode) is loopback only", on(8001).every((p) => p.startsWith("127.0.0.1:")), on(8001).join(" ") || "not running");
  console.log(`[INFO] app port 8000: ${on(8000).join(" ") || "not listening"} (0.0.0.0 = LAN demo on, D46; ufw limits it to the subnet)`);
}
if (offline) check("offline: the internet is unreachable", !(await reachable("1.1.1.1", 443)) && !(await reachable("8.8.8.8", 53)));

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exitCode = failures ? 1 : 0;
