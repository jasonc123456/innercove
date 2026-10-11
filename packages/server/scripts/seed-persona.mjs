import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import path from "node:path";
import { DatabaseStore, DatabaseError } from "../dist/store/db.js";
import { seedFictionalPersona } from "../dist/store/seed.js";

// Never auto-seed or read credentials from argv/env/a key file. Stop the API
// using this database first; this tool opens a separate encrypted connection.
const args = process.argv.slice(2);
let dbPath;
let confirmed = false;
let database;
try {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--confirm-fictional") confirmed = true;
    else if (args[i] === "--db" && args[i + 1]) dbPath = args[++i];
    else throw new Error("Invalid options");
  }
  if (!confirmed || !dbPath) throw new Error("Missing options");
  const persona = JSON.parse(await readFile(new URL("../../../docs/prep/demo-persona.json", import.meta.url), "utf8"));
  // readline's terminal echo is sent to this muted output, not the terminal.
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const reader = createInterface({ input: process.stdin, output: muted, terminal: Boolean(process.stdin.isTTY) });
  if (process.stdin.isTTY) process.stderr.write("Database passphrase (hidden): ");
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
  try { console.log(JSON.stringify({ seeded: seedFictionalPersona(lease, persona) })); } finally { lease.release(); }
} catch (error) {
  // Content and credentials never appear in errors or the count-only output.
  console.error(error instanceof DatabaseError ? error.message : "Unable to seed demo database; require --db PATH --confirm-fictional and a passphrase on stdin");
  process.exitCode = 1;
} finally { await database?.shutdown(); }
