/**
 * SQLCipher + FTS5 compatibility spike (Phase 2 prerequisite, D26).
 *
 * Proves, on THIS machine, that the chosen driver
 * (`better-sqlite3-multiple-ciphers`, D07) can actually deliver
 * SQLCipher-COMPATIBLE encryption-at-rest with WAL + FTS5 + the
 * pragmas D26 requires -- not just "encryption is available somehow".
 *
 * VERIFIED FROM THE INSTALLED PACKAGE'S OWN README (not assumed):
 * this driver's DEFAULT cipher is "sqleet", NOT SQLCipher. Getting the
 * actual SQLCipher-compatible on-disk format requires explicitly
 * running, in this exact order, BEFORE any other pragma or query:
 *   db.pragma(`cipher='sqlcipher'`)
 *   db.pragma(`legacy=4`)        // pins SQLCipher v4's KDF/page-size defaults
 *   db.pragma(`key='...'`)
 * Omitting the first two lines silently encrypts with sqleet instead
 * -- a different, non-SQLCipher-compatible format that would still
 * "work" (round-trip correctly) but would NOT be what the plan's
 * "the same format works with SQLCipher on Android" claim needs.
 *
 * The README also documents a real, unresolved caveat: writing in
 * this mode does not guarantee the file opens in DB Browser for
 * SQLite -- "it only supports creating/editing legacy SQLCipher
 * databases ... it's highly likely that you won't be able to open a
 * database created using better-sqlite3-multiple-ciphers in DB
 * Browser for SQLite." This spike does not have DB Browser or an
 * Android SQLCipher build available to test that claim directly; it
 * is reported as an open risk, not verified true or false here.
 *
 * Never touches the app's real data directory; everything lives under
 * a fresh os.tmpdir() subdirectory, deleted at the end of a
 * successful run. The passphrase is a TEST-ONLY constant and is never
 * logged -- every console line below is static text or non-secret
 * metadata (byte counts, row counts, booleans), never the key itself.
 *
 * ALSO CONFIRMED (package.json carries `better-sqlite3` -- the VANILLA
 * package -- alongside `better-sqlite3-multiple-ciphers`): this is not
 * a mistake or a fallback. `drizzle-orm/better-sqlite3`'s driver module
 * has a static, unconditional `import Client from "better-sqlite3"` at
 * its own top level (used by ITS internal convenience/quick-connect
 * constructors, not by this file), so merely importing that adapter
 * fails to resolve at all unless the literal `better-sqlite3` package
 * is installed -- regardless of which client instance is actually
 * passed to `drizzle()`. The real, encrypted client passed below is
 * always the `better-sqlite3-multiple-ciphers` instance opened via
 * `openSqlcipherCompatible()`; vanilla `better-sqlite3` is never
 * constructed or touched by this spike's own code, it just needs to
 * be present on disk for that one static import to succeed.
 */
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { configureCipher } from "./cipher.js";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------- fixtures --
const TEST_ONLY_PASSPHRASE = "spike-test-only-passphrase-never-real";
const WRONG_PASSPHRASE = "a-completely-different-wrong-passphrase";
const CANARY = "CANARY-FICTIONAL-innercove-spike-7f3a9c";
const SQLITE_MAGIC_HEADER = "SQLite format 3\u0000";

type CheckResult = { label: string; pass: boolean; detail?: string };
const results: CheckResult[] = [];

function record(label: string, pass: boolean, detail?: string) {
  results.push(detail === undefined ? { label, pass } : { label, pass, detail });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark} - ${label}${detail ? ` (${detail})` : ""}`);
}

function openSqlcipherCompatible(path: string, key: string) {
  const db = new Database(path);
  try {
    configureCipher(db, key);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "innercove-sqlcipher-spike-"));
  const dbPath = join(dir, "spike.db");
  console.log(`Using scratch directory: ${dir}`);


  // --------------------------------------------------- 1. native module loads --
  try {
    const probe = new Database(":memory:");
    probe.close();
    record("native module loads (in-memory db opens and closes)", true);
  } catch (err) {
    record("native module loads", false, String(err));
    printSummaryAndExit(dir, results);
    return;
  }

  // ------------------------------------- 2/3. SQLCipher-compatible encrypted write --
  let db: Database.Database;
  try {
    db = openSqlcipherCompatible(dbPath, TEST_ONLY_PASSPHRASE);
    record("file-backed db explicitly configured for SQLCipher-compatible mode", true, "cipher=sqlcipher, legacy=4");
  } catch (err) {
    record("configure SQLCipher-compatible mode", false, String(err));
    printSummaryAndExit(dir, results);
    return;
  }

  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("secure_delete = ON");
    db.pragma("temp_store = MEMORY");

    const journalMode = db.pragma("journal_mode", { simple: true });
    const foreignKeys = db.pragma("foreign_keys", { simple: true });
    const secureDelete = db.pragma("secure_delete", { simple: true });
    const tempStore = db.pragma("temp_store", { simple: true });

    record("journal_mode=WAL takes effect (checked, not assumed)", journalMode === "wal", `effective=${journalMode}`);
    record("foreign_keys=ON takes effect", foreignKeys === 1, `effective=${foreignKeys}`);
    record("secure_delete=ON takes effect", secureDelete === 1 || secureDelete === "1", `effective=${secureDelete}`);
    // temp_store: 0=DEFAULT, 1=FILE, 2=MEMORY -- SQLite returns the integer.
    record("temp_store=MEMORY takes effect", tempStore === 2, `effective=${tempStore}`);
  } catch (err) {
    record("set/verify WAL + foreign_keys + secure_delete + temp_store pragmas", false, String(err));
  }

  try {
    db.exec(`
      CREATE TABLE fixture (
        id INTEGER PRIMARY KEY,
        content TEXT NOT NULL
      );
    `);
    db.prepare("INSERT INTO fixture (id, content) VALUES (?, ?)").run(1, CANARY);
    const row = db.prepare("SELECT content FROM fixture WHERE id = ?").get(1) as { content: string } | undefined;
    record("write + read a test row", row?.content === CANARY, `read back: ${row?.content === CANARY ? "match" : "MISMATCH"}`);
  } catch (err) {
    record("write + read a test row", false, String(err));
  }

  // ------------------------------------------------------------------- FTS5 --
  try {
    db.exec(`CREATE VIRTUAL TABLE fixture_fts USING fts5(content, content='fixture', content_rowid='id');`);
    db.exec(`INSERT INTO fixture_fts(rowid, content) SELECT id, content FROM fixture;`);
    const hit = db
      .prepare("SELECT content FROM fixture_fts WHERE fixture_fts MATCH ? ORDER BY rank")
      .get("CANARY") as { content: string } | undefined;
    record("FTS5 table creation + indexing + MATCH query inside the encrypted db", hit?.content === CANARY);
  } catch (err) {
    record("FTS5 table/indexing/MATCH", false, String(err));
  }

  // ------------------------------------- WAL file itself must be encrypted --
  // The earlier end-of-run canary/header check (below) only inspects
  // whatever -wal/-shm files happen to still exist AFTER every connection
  // in this script has been cleanly closed -- a clean close can
  // checkpoint-and-remove the WAL file entirely, which would make that
  // later check pass VACUOUSLY (nothing to find a canary in, not "found
  // nothing because it's encrypted"). This check writes a second,
  // distinct canary and inspects the live -wal file's raw bytes WHILE
  // the connection is still open (before any close/checkpoint), so there
  // is actually something on disk to prove is not plaintext.
  const WAL_CANARY = "CANARY-FICTIONAL-innercove-wal-live-b218";
  try {
    db.prepare("INSERT INTO fixture (id, content) VALUES (?, ?)").run(2, WAL_CANARY);
    const walPathLive = `${dbPath}-wal`;
    const walExistedWhileOpen = existsSync(walPathLive);
    let walContainsCanaryPlaintext = false;
    if (walExistedWhileOpen) {
      walContainsCanaryPlaintext = readFileSync(walPathLive).toString("latin1").includes(WAL_CANARY);
    }
    record(
      "the live -wal file (inspected before any close/checkpoint) does not contain the new row's canary in plaintext",
      walExistedWhileOpen && !walContainsCanaryPlaintext,
      walExistedWhileOpen ? "wal file present, inspected" : "wal file did not exist to inspect -- inconclusive, not a pass by default",
    );
  } catch (err) {
    record("live WAL-file plaintext check", false, String(err));
  }

  // ------------------------------------------------------- close + reopen --
  db.close();
  try {
    const reopened = openSqlcipherCompatible(dbPath, TEST_ONLY_PASSPHRASE);
    const row = reopened.prepare("SELECT content FROM fixture WHERE id = ?").get(1) as
      | { content: string }
      | undefined;
    record("close + reopen with the CORRECT key preserves the row", row?.content === CANARY);
    reopened.close();
  } catch (err) {
    record("close + reopen with the correct key", false, String(err));
  }

  // -------------------------------------------- wrong key / no key must fail --
  // Opening the file handle itself is expected to succeed either way (it's
  // just fopen); the actual proof point is whether the FIRST read that
  // needs to decrypt a real page fails. Reported as directly observed,
  // not assumed, by checking at which step the failure actually occurs.
  try {
    const wrongKeyDb = openSqlcipherCompatible(dbPath, WRONG_PASSPHRASE);
    let failedOnOpen = false;
    let failedOnRead = false;
    try {
      wrongKeyDb.prepare("SELECT content FROM fixture WHERE id = ?").get(1);
    } catch {
      failedOnRead = true;
    }
    try {
      wrongKeyDb.close();
    } catch {
      /* already unusable; fine either way */
    }
    record(
      "opening with the WRONG key fails when actually reading schema/data",
      failedOnRead,
      failedOnOpen ? "failed at open" : failedOnRead ? "open succeeded, failed at first read (expected)" : "did NOT fail at all",
    );
  } catch (err) {
    // The constructor/pragma sequence itself threw -- also an acceptable
    // "fails", just at an earlier point than expected; report exactly where.
    record("opening with the WRONG key fails", true, `failed earlier, at open/pragma: ${String(err).slice(0, 80)}`);
  }

  try {
    const noKeyDb = new Database(dbPath); // no cipher/legacy/key pragmas at all
    let failed = false;
    try {
      noKeyDb.prepare("SELECT content FROM fixture WHERE id = ?").get(1);
    } catch {
      failed = true;
    }
    try {
      noKeyDb.close();
    } catch {
      /* ignore */
    }
    record("opening with NO key fails when actually reading schema/data", failed);
  } catch (err) {
    record("opening with no key fails", true, `failed earlier, at open: ${String(err).slice(0, 80)}`);
  }

  // ------------------------------------------------- delete fixture + FTS --
  try {
    const live = openSqlcipherCompatible(dbPath, TEST_ONLY_PASSPHRASE);
    live.prepare("DELETE FROM fixture WHERE id = ?").run(1);
    live.exec(`INSERT INTO fixture_fts(fixture_fts, rowid, content) VALUES('delete', 1, '${CANARY}');`);
    const rowGone = live.prepare("SELECT content FROM fixture WHERE id = ?").get(1);
    const ftsGone = live.prepare("SELECT content FROM fixture_fts WHERE fixture_fts MATCH ?").get("CANARY");
    record("deleting the fixture removes it from the normal table", rowGone === undefined);
    record("deleting the fixture removes it from FTS search", ftsGone === undefined);

    // FTS cleanup + VACUUM -- version-appropriate for the bundled SQLite
    // (FTS5's 'optimize' command, documented stable since SQLite 3.x's
    // FTS5 module; no FTS4-style separate shadow-table rebuild needed).
    live.exec(`INSERT INTO fixture_fts(fixture_fts) VALUES('optimize');`);
    live.exec(`VACUUM;`);
    record("FTS 'optimize' cleanup and VACUUM run without error", true);
    live.close();
  } catch (err) {
    record("delete fixture / FTS cleanup / VACUUM", false, String(err));
  }

  // --------------------------------------------------------- Drizzle query --
  try {
    const drizzleDb = openSqlcipherCompatible(dbPath, TEST_ONLY_PASSPHRASE);
    const fixtureTable = sqliteTable("drizzle_fixture", {
      id: integer("id").primaryKey(),
      content: text("content").notNull(),
    });
    const orm = drizzle(drizzleDb);
    orm.run(sql`CREATE TABLE drizzle_fixture (id INTEGER PRIMARY KEY, content TEXT NOT NULL)`);
    orm.insert(fixtureTable).values({ id: 1, content: CANARY }).run();
    const rows = orm.select().from(fixtureTable).all();
    record(
      "a minimal Drizzle query works through this driver (drizzle-orm/better-sqlite3)",
      rows.length === 1 && rows[0]?.content === CANARY,
    );
    drizzleDb.close();
  } catch (err) {
    record("Drizzle integration", false, String(err));
  }

  // ---------------------------------- canary / raw-bytes check on disk --
  // IMPORTANT, stated explicitly: the absence of the plaintext canary
  // string proves nothing by itself (it could be absent for reasons
  // unrelated to encryption -- compression, encoding, bad luck). The
  // header-magic check below is the stronger of the two signals: an
  // UNENCRYPTED SQLite file is REQUIRED to start with the exact 16-byte
  // ASCII magic string "SQLite format 3\0"; real encryption scrambles
  // that header too. Passing both is still not a cryptographic proof of
  // correct encryption (that would need inspecting SQLite3MultipleCiphers'
  // own cipher implementation), just strong behavioral evidence.
  try {
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    const filesToCheck = [dbPath, walPath, shmPath].filter((p) => existsSync(p));
    let canaryFoundAnywhere = false;
    let headerLooksPlaintext = false;
    for (const p of filesToCheck) {
      const buf = readFileSync(p);
      if (buf.toString("latin1").includes(CANARY)) canaryFoundAnywhere = true;
      if (p === dbPath && buf.subarray(0, 16).toString("latin1") === SQLITE_MAGIC_HEADER) {
        headerLooksPlaintext = true;
      }
    }
    record(
      "plaintext canary absent from the .db file and any -wal/-shm journals (weak signal, see note)",
      !canaryFoundAnywhere,
      `files checked: ${filesToCheck.length}`,
    );
    record(
      "main db file header is NOT the standard unencrypted SQLite magic string (stronger signal)",
      !headerLooksPlaintext,
    );
  } catch (err) {
    record("raw-file canary/header check", false, String(err));
  }

  printSummaryAndExit(dir, results);
}

function printSummaryAndExit(dir: string, allResults: CheckResult[]) {
  const failed = allResults.filter((r) => !r.pass);
  console.log("\n--- summary ---");
  console.log(`${allResults.length - failed.length}/${allResults.length} checks passed.`);
  if (failed.length > 0) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ""}`);
  }
  try {
    rmSync(dir, { recursive: true, force: true });
    console.log(`Scratch directory removed: ${dir}`);
  } catch {
    console.log(`Warning: could not remove scratch directory ${dir}; remove it manually.`);
  }
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("Spike crashed unexpectedly:", err);
  process.exitCode = 1;
});
