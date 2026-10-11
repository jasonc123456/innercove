# InnerCove

A local AI wellness companion with SQLCipher-encrypted saved chats, diary and permission-controlled memories. It is a non-clinical companion, not a diagnosis or emergency-monitoring service. Temporary chat history stays in browser memory; saved chats use the encrypted hub database.

Run commands below from the repository root in a Bash-compatible terminal unless stated otherwise. They are operator instructions for your own checkout; coordinate changes to a shared deployment with its owner.

## Prerequisites and installation

- Node.js 22 and npm; Git.
- Python 3, Make and a C++ compiler for native SQLite modules when prebuilt binaries are unavailable. Full backend tests also use `strings` and either the `sqlite3` CLI or Python's `sqlite3` binding. The demo port checks use Linux `ss`.
- For real inference: LM Studio on the same hub, with the Qwen3.8-27B Q6_K model loaded as `qwen/qwen3.8-27b` (D43/D45). Fake-provider development needs no model/GPU.
- For Compose: Docker Engine and Docker Compose v2 on Linux with host networking. Docker Desktop/WSL needs integration enabled; these Compose files target the Linux hub.

```bash
npm ci
npm install --prefix web
```

The root manages `packages/core` and `packages/server`; `web` installs separately. Keep the checkout's `config/` and `docs/prep/` files: the API needs its prompt/safety configuration and the web build bundles crisis resources.

## Provider configuration

If you do not already have `.env`, create it with:

```bash
cp -n .env.example .env
chmod 600 .env
```

Edit `.env` locally. For LM Studio, use these values, replacing the token placeholder:

```dotenv
INFERENCE_PROVIDER=lmstudio
LOCAL_AI_BASE_URL=http://127.0.0.1:1234/v1
LOCAL_AI_MODEL=qwen/qwen3.8-27b
LOCAL_AI_API_KEY="REPLACE_WITH_LOCAL_LM_STUDIO_TOKEN"
INFERENCE_ACCELERATION=unknown
HOST=127.0.0.1
PORT=8000
DB_PATH=data/innercove.db
DB_ENCRYPTION=sqlcipher
```

Use `INFERENCE_PROVIDER=fake` for fixture replies instead. Set acceleration to `cuda`, `vulkan` or `cpu` only when known; it is an operator-supplied privacy-panel field, not autodetection. Keep LM Studio loopback-only, require authentication, enable content redaction, and disable verbose/file logging and per-request MCP integrations. See [decisions and model setup](docs/DECISIONS.md).

Never commit `.env`, tokens or real personal data. Database passphrases are submitted through setup/unlock, never configured in `.env`. The runtime supports SQLCipher only; `DB_ENCRYPTION=off` is rejected. `DEV_STORE=demo` is ignored and does not provide an unlocked in-memory database.

**Environment loading:** Compose reads `.env`; native `npm run dev` and `npm start` do not. Use the explicit Node `--env-file` commands below for native file-based configuration. Already exported environment variables take precedence over that file.

## Development

For a fake-provider API, terminal 1:

```bash
INFERENCE_PROVIDER=fake npm run dev
```

API: `http://127.0.0.1:8000`. In terminal 2:

```bash
cd web
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173`; Vite proxies `/api` to port 8000. To develop with your `.env` provider/configuration, replace terminal 1's command with:

```bash
npm run build --workspace=@innercove/core
node --env-file=.env --watch --import tsx packages/server/src/main.ts
```

Rebuild `@innercove/core` when changing shared source. API restarts lock the database again; unlock after a watcher restart.

For the existing Linux Compose hot-reload path:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

This serves Vite on port 8000 and keeps the API on `127.0.0.1:8001`. It mounts source and uses the same `data/` database as the packaged path. This is a development server, not the judging build.

## Packaged / production-style run

Native, using `.env`, built backend and bundled UI:

```bash
npm run build
npm run build --prefix web
node --env-file=.env packages/server/dist/main.js
```

Open `http://127.0.0.1:8000`. With configuration already exported instead of `.env`, `npm start` runs the same compiled API. Do not substitute `vite preview` for the combined server; it is not the configured API proxy.

Linux Compose builds and serves the UI plus API in one container:

```bash
docker compose up -d --build --remove-orphans
```

This also switches back from the Compose development overlay. Use `sudo` if required by your Docker permissions. The container uses host networking and persists the encrypted database in `./data:/app/data`; that host directory must be writable by its `node` user. Existing hub ownership/undo details are in the [setup log](docs/SETUP_LOG.md). Do not remove data or reset ownership blindly to fix a startup error.

### Loopback and the approved LAN demo

The default UI/API bind is `127.0.0.1:8000`; LM Studio stays on loopback at port 1234. Docker `ports:` publishing is intentionally absent. D46 permits the event's approved demo LAN over plain HTTP, with firewall access restricted to that LAN subnet, fictional data only, and the hub locked when not in use. Traffic is unencrypted and there is no per-device authentication; a home-page name/login UI is not hub database authentication.

For that approved Compose option, edit the local `.env`:

```dotenv
INNERCOVE_HOST=0.0.0.0
ALLOW_NON_LOOPBACK=1
```

Have the deployment owner apply/verify the subnet-limited firewall rule **before** enabling LAN service; use your approved subnet, not a public/all-networks rule. See [D46](docs/DECISIONS.md) and the [setup/undo log](docs/SETUP_LOG.md). `INNERCOVE_HOST` controls Compose; a native server reads `HOST` and requires `ALLOW_NON_LOOPBACK=1` for a non-loopback bind. In the dev overlay, only Vite's port 8000 uses the LAN option; the API remains loopback-only. D31 HTTPS/QR pairing is later work.

## Database setup and unlock

Every API process starts locked. Check its status (use the appropriate proxy/API port for your run path):

```bash
curl --fail-with-body http://127.0.0.1:8000/api/lock-status
```

On first use, setup creates the encrypted database and identity/settings. It requires a passphrase of at least 8 characters and refuses any existing database file (`409`). These examples prompt without placing the passphrase in shell history or process arguments; they require Python 3 and an interactive terminal.

```bash
python3 -c 'import getpass,json; print(json.dumps({"passphrase":getpass.getpass("New database passphrase: ")}))' |
  curl --fail-with-body -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:8000/api/setup
```

After a restart or lock, unlock the existing database with its original passphrase:

```bash
python3 -c 'import getpass,json; print(json.dumps({"passphrase":getpass.getpass("Database passphrase: ")}))' |
  curl --fail-with-body -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:8000/api/unlock
```

Setup succeeds with `201 { "locked": false }`; unlock with `200 { "locked": false }`. Wrong credentials return `401`; five failures impose a 30-second cooldown. Keep the passphrase: the server stores no recoverable key.

While locked, protected APIs return `423`, including temporary inference, settings and privacy status. Only `GET /api/health`, `GET /api/lock-status`, `POST /api/setup` and `POST /api/unlock` are exempt. Static help/crisis resources remain available. To lock an unlocked hub:

```bash
curl --fail-with-body -X POST http://127.0.0.1:8000/api/lock
```

The latest plan still lists real setup/unlock UI integration as pending; the home-page login does not replace these API steps. Settings and content-reset semantics, including D39 retention and VACUUM, are documented in the [backend handoff](packages/server/src/store/README.md#phase-5-settings-content-reset-and-seed-handoff). No delete-all command is part of startup.

## Optional fictional persona seed

Seeding is explicit, never automatic. First set up a database, then stop every API process using that file (Ctrl-C for native; `docker compose stop app` for packaged Compose, or the same dev-overlay Compose command with `stop app`). With host dependencies installed, run from the root:

```bash
npm run build
npm run seed:persona --workspace=@innercove/server -- --db data/innercove.db --confirm-fictional
```

Replace the path if using a different `DB_PATH`. The tool requires an already initialized encrypted file and prompts for its passphrase; never supply that passphrase in argv or environment variables. `--confirm-fictional` explicitly consents to importing D's fictional fixture. Any existing user content, links or tombstones causes refusal; it will not overwrite, duplicate or silently reset content. Identity/settings/devices remain. Restart the stopped API using the chosen run path and unlock again.

The npm command needs host build dependencies; the pruned production container cannot run its TypeScript build script. See the [seed handoff](packages/server/src/store/README.md#phase-5-settings-content-reset-and-seed-handoff) for fixture scope and offline lifecycle details.

## Checks and demo gate

From the root, with dependencies installed:

```bash
npm run typecheck
npm run typecheck --workspace=@innercove/core
npm run validate
npm test
node scripts/check-safety.mjs
npm run build
npm run build --prefix web
npm run spike:sqlcipher --workspace=@innercove/server
npm run smoke:db --workspace=@innercove/server
```

Build the core first if invoking workspace checks alone. The spike and compiled smoke use disposable scratch databases/FakeProvider; the smoke includes reset/VACUUM and seed checks on scratch data, not the live hub. Recorded Phase 5 GX10 verification is already in the [Phase log](docs/PROJECT_PLAN.md) and [backend handoff](packages/server/src/store/README.md#phase-5-gx10-verification-and-remaining-assignments-2026-10-10).

For A's integration gate, run on the hub against an unlocked fictional demo database with the local model available:

```bash
node scripts/demo-check.mjs http://127.0.0.1:8000
```

After the operator disconnects the router uplink while retaining access to the hub:

```bash
node scripts/demo-check.mjs http://127.0.0.1:8000 --offline
```

The script writes fictional entries/chat and cleans up its items; deletion leaves content-free tombstones, so run the optional seed before the gate. It checks API context, D33, temporary chat, crisis replies and local listener bindings. It currently **skips delete-all**, does not exercise the browser/excerpt UI or prove firewall enforcement, and its `--offline` flag checks internet reachability; the actual unplugged journey remains an acceptance task. See the [demo runbook](docs/DEMO_SCRIPT.md) and [current acceptance gaps](docs/PROJECT_PLAN.md). No new live Qwen/UI, CSP or offline pass is claimed by these instructions.

## Common startup problems

| Symptom | Action |
| --- | --- |
| Missing `LOCAL_AI_API_KEY` / model unreachable | Native npm scripts do not load `.env`; use the explicit Node command. Check the local token, LM Studio authentication, loaded model ID and loopback URL. Fake mode needs no token. |
| `423`, chat stops after code reload | The API restarted locked. Check lock status and unlock; do not delete or re-setup the database. |
| Setup returns `409` | A database already exists (even an empty file). Use unlock for an initialized database; inspect the configured path rather than overwriting it. |
| Module/build errors for SQLCipher | Use Node 22 and install Python/Make/C++ tooling, then rerun dependency installation. Keep encryption enabled. |
| UI missing / blank root | Build `web` for the compiled run, or start its separate Vite server for native development. Root `npm run build` builds the backend only. |
| `EADDRINUSE` | Stop the competing local run path or select matching API/proxy ports. Do not run native and Compose on port 8000 together. |
| Native custom API port | Set `PORT` for the API and `INNERCOVE_API=http://127.0.0.1:YOUR_API_PORT` for Vite; replace the placeholder before running. |
| Docker absent in WSL / data permission error | Enable Docker Desktop WSL integration; check bind-mount ownership against the container user with the deployment owner. |
| Seed refused | Confirm the target is initialized, the original key is correct, the API is stopped and the content store is empty. Do not reset existing data just to seed. |
| Refused non-loopback bind | Stay on loopback, or follow the approved D46 option and owner-managed firewall restrictions. |

Detailed sources: [agent guide](AGENTS.md), [team ownership](docs/TEAM_PLAN.md), [API contracts and phase handoffs](docs/PROJECT_PLAN.md), [decisions](docs/DECISIONS.md), [encrypted backend handoff](packages/server/src/store/README.md), [setup/undo log](docs/SETUP_LOG.md), and [safety testing](tests/TESTING.md).
