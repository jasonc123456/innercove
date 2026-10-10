# SQLCipher + FTS5 compatibility spike — WSL and GX10 results

**Machine:** `HongAsus202605`, Linux 6.18.33.1-microsoft-standard-WSL2, `x86_64` (Node reports `linux x64`). **Historical WSL result:** this machine is not the GX10. The original checks below passed locally; successful GX10 host/container verification is recorded separately below.

**Rerun with:** `npm run spike:sqlcipher --workspace=@innercove/server` (from the repo root).

## Dependency versions (exact, as resolved by npm)

| Package | Version | Role |
|---|---|---|
| `better-sqlite3-multiple-ciphers` | `13.0.3` | The actual encrypted-DB driver (D07) |
| `better-sqlite3` (vanilla) | `13.0.3` | Installed ONLY to satisfy `drizzle-orm/better-sqlite3`'s own static import — never constructed or used by this spike's code; see finding below |
| SQLite3 Multiple Ciphers (bundled, per the driver's own README) | `2.4.0` | The C extension `better-sqlite3-multiple-ciphers` links against |
| `drizzle-orm` | `0.45.4` | ORM layer, `drizzle-orm/better-sqlite3` adapter |
| Node | `v22.22.1` | |

**Prebuilt binary, not source-compiled** — confirmed, not assumed:
- `better-sqlite3-multiple-ciphers`'s own `package.json` sets `"gypfile": false` and has no `install` script, so npm never triggers a native build for it.
- `node_modules/.../build/` contains only `.stamp`/`.mk`/`.gypi` metadata shipped in the npm tarball itself — no compiled `.o` files or `.node` binary exist there.
- The real binary loaded is one of `prebuilds/{linux-x64,linux-arm64,linuxmusl-x64,linuxmusl-arm64,darwin-x64,darwin-arm64,win32-x64,win32-arm64}.node`, shipped directly inside the package. On this machine, `linux-x64.node` was used. **A matching `linux-arm64.node` prebuild exists in the same installed package** — relevant evidence that the GX10 (assuming a glibc-based Linux, not musl) should not need on-device compilation either, though this historical local inspection alone did not prove it loads on the GX10. The later runs below establish runtime compatibility, without identifying whether a particular binary was prebuilt or compiled.

## Confirmed finding: the driver's DEFAULT cipher is NOT SQLCipher

Read directly from the installed `13.0.3` package's own `README.md` (not assumed from the package name):
- The **default** cipher, if you just call `db.pragma(\`key='...'\`)`, is **`sqleet`** — a different, non-SQLCipher-compatible on-disk format.
- Getting actual SQLCipher-**compatible** encryption requires, in this exact order, before any other pragma or query touches the file:
  ```js
  db.pragma(`cipher='sqlcipher'`);
  db.pragma(`legacy=4`);   // pins SQLCipher v4's KDF/page-size defaults
  db.pragma(`key='...'`);
  ```
- The README also documents a real, **unresolved** caveat: *"it only supports creating/editing legacy SQLCipher databases ... it's highly likely that you won't be able to open a database created using better-sqlite3-multiple-ciphers in DB Browser for SQLite."* This spike has no DB Browser or Android SQLCipher build available to test that claim directly — it is an **open risk**, not verified true or false here. If the plan's "same format works with SQLCipher on Android" claim (§3) needs real interop with another SQLCipher implementation, that needs its own, separate verification before relying on it.

## Confirmed finding: `drizzle-orm/better-sqlite3` statically imports the literal `better-sqlite3` package

`node_modules/drizzle-orm/better-sqlite3/driver.js` has `import Client from "better-sqlite3"` at its own top level, used by its internal quick-connect convenience constructors. This import fails to resolve at all — regardless of which client you actually pass to `drizzle()` — unless the real `better-sqlite3` package is also installed. The fix applied here: `better-sqlite3` is now also a dependency of `@innercove/server`, used **only** to satisfy that import; every actual database operation in this spike (and in the real app, going forward) goes through the already-constructed `better-sqlite3-multiple-ciphers` client passed into `drizzle(client)`, never through vanilla `better-sqlite3`'s own constructor.

## Checks: 18/18 PASS (exit code 0)

| # | Check | Result |
|---|---|---|
| 1 | Native module loads (in-memory db opens/closes) | PASS |
| 2 | File-backed db explicitly configured for SQLCipher-compatible mode (`cipher=sqlcipher`, `legacy=4`, then `key=`) | PASS |
| 3 | `journal_mode=WAL` takes effect (checked via `db.pragma(..., {simple:true})`, not assumed) | PASS (`wal`) |
| 4 | `foreign_keys=ON` takes effect | PASS (`1`) |
| 5 | `secure_delete=ON` takes effect | PASS (`1`) |
| 6 | `temp_store=MEMORY` takes effect | PASS (`2`) |
| 7 | Write + read a test row | PASS |
| 8 | FTS5 table creation + indexing + `MATCH` query inside the encrypted db | PASS |
| 9 | The LIVE `-wal` file (inspected while the connection is still open, before any close/checkpoint) does not contain a freshly-written canary in plaintext | PASS |
| 10 | Close + reopen with the CORRECT key preserves the row | PASS |
| 11 | Opening with the WRONG key fails **when actually reading** schema/data (open itself succeeds — expected, it's just `fopen`; the first real read throws) | PASS |
| 12 | Opening with NO key fails when actually reading schema/data | PASS |
| 13 | Deleting the fixture removes it from the normal table | PASS |
| 14 | Deleting the fixture removes it from FTS search | PASS |
| 15 | FTS `'optimize'` cleanup + `VACUUM` run without error | PASS |
| 16 | A minimal Drizzle query (`drizzle-orm/better-sqlite3`) works through this driver | PASS |
| 17 | Plaintext canary absent from the `.db` file after everything is closed (weak signal — see note below) | PASS |
| 18 | The main `.db` file's first 16 bytes are NOT the standard unencrypted SQLite magic header `"SQLite format 3\0"` (stronger signal) | PASS |

**Explicit honesty note (per task instructions):** check #17 (string absence after close) is a **weak** signal by itself — a string's absence proves nothing about *why* it's absent. Check #9 (the live `-wal` file, inspected before any clean close could checkpoint it away) and check #18 (the scrambled file header) are the actually-informative checks here: #9 proves there was real on-disk content to inspect and it wasn't plaintext; #18 proves the file doesn't even have a valid unencrypted SQLite structure. Neither of these is a cryptographic proof that the *correct* cipher/key-derivation parameters were used — only that the output is not plaintext SQLite.

## GX10 host and ARM64 Docker verification — 2026-10-10

Actual runs reported by the operator at checkout `8e96d52`:

| Environment | Runtime | Results |
|---|---|---|
| GX10 host | Linux aarch64; Node v24.15.0; npm 11.12.1 | Spike 18/18, production database smoke PASS, `npm test` 99/99 across 8 files; each exit 0 |
| Separate `innercove-db-verify:8e96d52` image | linux arm64; Node v22.23.3 | Spike 18/18 and production database smoke PASS; combined exit 0 |

The image was built separately; the existing running Compose service was not replaced. Production smoke (`npm run smoke:db --workspace=@innercove/server`) covers setup/lock/unlock, packaged migrations, SIGTERM shutdown, encrypted reopen and plaintext rejection. These runs establish native-driver/FTS5 and database-foundation compatibility on GX10 ARM64, without proving full Compose deployment, UI or inference acceptance. They do not establish which native artifact was loaded or whether compilation was necessary.

## Remaining interoperability and implementation work

External SQLCipher interoperability (including DB Browser and Android SQLCipher) remains unverified, as described above. Opening a database with this same driver on two architectures does not establish cross-implementation format compatibility.

Encrypted initialization, migrations and lock/unlock are implemented and their production smoke now passes on WSL x64, GX10 host and the isolated ARM64 image. Phase 2 remains incomplete: conversation/diary repositories and APIs, SQL-backed persistent chat/history integration and runtime permission enforcement beyond locking remain work for B. Explicit cipher configuration remains required; the default is not SQLCipher, and Drizzle's vanilla dependency only resolves its adapter import. No plaintext fallback is enabled and no runtime encryption configuration was changed by verification.
