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
    ...process.env, INFERENCE_PROVIDER: "fake", HOST: "127.0.0.1", PORT: "0",
    DB_PATH: file, DB_ENCRYPTION: encryption, DEV_STORE: "", WEB_DIST: path.join(dir, "no-web"),
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
  running.child.kill("SIGTERM");
  assert.equal(await running.exited, 0, "SIGTERM exit");
  assert.ok(!running.output().includes(passphrase), "credential absent from process output");
  reopened = new DatabaseStore(file);
  await reopened.unlock(passphrase);
  const lease = reopened.acquire();
  try {
    assert.equal(lease.db.prepare("SELECT count(*) n FROM __drizzle_migrations").get().n, 1);
    assert.ok(lease.db.prepare("SELECT user_id FROM settings WHERE user_id=?").get(lease.userId));
  } finally { lease.release(); }
  await reopened.shutdown();
  running = launch("off");
  assert.equal(await running.exited, 1, "plaintext mode explicitly rejected");
  assert.match(running.output(), /supports SQLCipher only/);
  console.log("PASS: compiled server setup/lock/unlock, packaged migrations, SIGTERM, encrypted reopen, plaintext rejection");
} finally {
  if (running && running.child.exitCode === null && running.child.signalCode === null) {
    running.child.kill("SIGTERM"); await running.exited;
  }
  await reopened?.shutdown();
  rmSync(dir, { recursive: true, force: true });
}
