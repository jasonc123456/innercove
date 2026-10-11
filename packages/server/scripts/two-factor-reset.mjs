import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import path from "node:path";
import { DatabaseStore, DatabaseError } from "../dist/store/db.js";
import { clearTwoFactor, readTwoFactor } from "../dist/api/two-factor.js";

// D47: a lost authenticator is reset only from a shell on the hub. Turns two-factor off
// (secret and recovery codes deleted); the owner can set it up again in Settings.
// Stop the API using this database first. The passphrase is read hidden from stdin, never argv/env.
const args = process.argv.slice(2);
let dbPath;
let database;
try {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--db" && args[i + 1]) dbPath = args[++i];
    else throw new Error("Invalid options");
  }
  if (!dbPath) throw new Error("Missing options");
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const reader = createInterface({ input: process.stdin, output: muted, terminal: Boolean(process.stdin.isTTY) });
  if (process.stdin.isTTY) process.stderr.write("Hub passphrase (hidden): ");
  let passphrase = await new Promise((resolve, reject) => {
    reader.once("line", resolve);
    reader.once("close", () => reject(new Error("Passphrase required")));
    reader.once("SIGINT", () => { reader.close(); });
  });
  reader.close();
  if (process.stdin.isTTY) process.stderr.write("\n");
  database = new DatabaseStore(path.resolve(dbPath));
  try { await database.unlock(passphrase); } finally { passphrase = ""; }
  const lease = database.acquire();
  try {
    const was = readTwoFactor(lease)?.enabled ?? false;
    clearTwoFactor(lease);
    console.log(JSON.stringify({ twoFactor: "off", wasEnabled: was }));
  } finally { lease.release(); }
} catch (error) {
  console.error(error instanceof DatabaseError ? error.message : "Unable to reset two-factor; require --db PATH and the hub passphrase on stdin");
  process.exitCode = 1;
} finally { await database?.shutdown(); }
