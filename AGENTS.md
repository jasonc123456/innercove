# InnerCove — agent guide
Local-first wellness companion for the GX10 hackathon. Read `docs/TEAM_PLAN.md` (your role), then the phase you're on in `docs/PROJECT_PLAN.md`. Decisions are in `docs/DECISIONS.md`; §3c of the plan is the API contract.

## Run and test
- `npm install` at the root (npm workspaces; `web/` has its own `npm install`).
- The app always uses the real model; when LM Studio is unreachable the chat shows an offline notice, never a canned reply. `INFERENCE_PROVIDER=fake` is refused unless `NODE_ENV=test` (automated tests and `smoke-db.mjs` only). `npm run dev` builds `@innercove/core`, then runs the API on 127.0.0.1:8000. Saved chat/history now use the SQLCipher request lease; set up/unlock the database before chatting. The legacy `DEV_STORE=demo` flag no longer selects an in-memory production store. `cd web && npm run dev` proxies `/api` to it.
- Real model: copy `.env.example` to `.env` (untracked), set `LOCAL_AI_API_KEY` from `~/.config/innercove/lmstudio.token`, set `INFERENCE_PROVIDER=lmstudio`.
- `npm test` (vitest), `npm run typecheck`, `npm run validate` (B's contract checks). `@innercove/core` resolves to its `dist/`, so these scripts build it first.
- `sudo docker compose up -d --build`: the demo build (web + API in one container, host network, 127.0.0.1:8000).
- Dev mode on the GX10 (`docker-compose.dev.yml`): `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`. Vite serves `web/` from source with hot reload on :8000 and proxies `/api` to the API under `tsx watch` on 127.0.0.1:8001, so a `git pull` shows up without a rebuild. A server-code change restarts the API, which locks the DB and ends sessions (sign in again). Back to the demo build: `docker compose up -d --build --remove-orphans`.
- Phase 0 scripts: `scripts/run_eval.py`, `scripts/smoke-inference.py` (stdlib Python; env as above).
- Fictional persona into an encrypted DB (B): stop the API, then `npm run seed:persona --workspace=@innercove/server -- --db <path> --confirm-fictional`.
- Lost authenticator (D47): stop the API, then `npm run two-factor:reset --workspace=@innercove/server -- --db <path>` (hidden passphrase prompt) turns two-factor off.
- Phase 6 gate: `read -rs HUB_PASSPHRASE && export HUB_PASSPHRASE`, then `node scripts/demo-check.mjs [BASE_URL] [--offline] [--delete-all]` (`--delete-all` erases all hub content; use a throwaway hub). It signs in as `admin` (D47; this also unlocks the hub) and runs the demo journey through the API (entries A/B, chips, hide A → D33, temporary chat, crisis reply, ports) and cleans up after itself.

## Layout and owners (D44)
| Path | What | Owner |
|---|---|---|
| `packages/core/src/` | Pure shared code (`@innercove/core`): Zod contracts and data-layer ports | B |
| `packages/core/src/api/chat.ts` | `/api/chat` + `/api/infer` request schemas and SSE event types | A |
| `packages/core/src/safety/` | Safety tiers, output screen, reviewed tier-2 replies, golden helpers | D |
| `packages/server/src/{app,main}.ts`, `api/chat.ts`, `api/health.ts` | Fastify app, chat and health routes | A |
| `packages/server/src/chat/`, `inference/` | Turn pipeline: D32 screening (`rules-safety.ts`; risk carries 3 turns, D50), retrieval (D49: every eligible memory, the model decides), prompt assembly, D33 history (`history.ts`), AI-written memories (`remember.ts`, D49; support notes D51), store ports; LM Studio + Fake providers | A |
| `packages/server/src/store/`, data routes in `api/` | SQLCipher DB, schema, migrations, repos | B |
| `config/`, `tests/*.json` | Safety rules, crisis resources, tier-2 replies, prompts; golden test cases | D |
| `web/` | React SPA; `App.tsx` and the router are C's | C |
| `scripts/`, `docs/` | Phase 0 eval scripts; plan, decisions, team split, GX10 setup log | A / everyone |

The plan's `core/<x>` paths map to `packages/core/src/<x>` (pure logic) or `packages/server/src/<x>` (server code); `store/<x>` to `packages/server/src/store/<x>`.

Single owners for hot files: `packages/core` contracts (B), schema and migrations (B), the chat pipeline (A), `App.tsx`/router (C). Ask before editing someone else's.

## Privacy rules (never break these)
- Never log request or response bodies, prompts, replies or diary text. Errors never echo input. Log event types and IDs only.
- Never persist or display model reasoning; the adapter strips `<think>`, `reasoning_content` and `reasoning` (D13).
- Every query is scoped by `user_id`; AI reads go through B's permission-filtered read port only.
- `/api/infer` (temporary chats) never writes anything (D35).
- Crisis resources come from static config, never from the model (D03). Model output is screened before display (D32).
- Bind 127.0.0.1 by default. Never use Docker `ports:` (binds 0.0.0.0, bypasses ufw); LM Studio stays on loopback with auth on (D18). The GX10's LAN demo opts in via `.env` with ufw limiting port 8000 to the subnet (D46).
- Every `/api` route needs a session except health, lock-status, first-run setup, unlock and the `/api/session` routes (D47; `packages/server/src/api/session.ts`). Route tests that aren't about sign-in pass `sessionGuard: signedIn` (`src/testing/signed-in.ts`); `main.ts` never does. No loopback exemption; never add a "dev bypass". Sign-in uses the hub passphrase; two-factor secrets live only in the encrypted DB.
- The repo is public (D40): no keys, `.env`, tokens, real personal data or private server details. Use the fictional persona only.

## Conventions
- TypeScript, Node 22, ESM (`.js` import suffixes), strict mode. camelCase in JSON/TS, snake_case columns.
- Errors: `{ error: { code, message, details? } }` with the §3c codes.
- IDs are UUIDv7; timestamps ISO-8601 UTC.
- Tests with `FakeProvider` assert on the assembled prompt. Saved chats make a second model call to write memories (D49) only when `rememberNotes: true` is passed to `buildApp` (`main.ts` does); tests opt in, so `provider.prompts.at(-1)` stays the chat prompt.

## Git
- Trunk-based: short branches `p<N>-<topic>`, merge to `main` every 2–3 h; `main` must pass `npm test` and `docker compose up`.
- Short commit messages. Pull (rebase) before pushing.
- CI (`.github/workflows/ci.yml`) runs on every push: typecheck, tests, `validate`, `check-safety`, the web build and a gitleaks secret scan. A red X on `main` means stop and fix it first.
- At the end of a phase, append ≤15 lines to the Phase log in `docs/PROJECT_PLAN.md`.

## GX10
- It's borrowed: log every system change with its undo in `docs/SETUP_LOG.md`.
- LM Studio runs inside the xrdp desktop session (it needs a display). **Disconnect** xrdp by closing the window; logging out stops the model server. If LM Studio dies, its `llama-server` engine can survive orphaned and keep ~50 GB: check `nvidia-smi` for two engines before loading again.
- Only A uses the GX10 during Phase 0; others use `ssh -L 1234:127.0.0.1:1234 gx10` (tests use `FakeProvider` in code).
