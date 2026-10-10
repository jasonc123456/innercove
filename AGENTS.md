# InnerCove — agent guide
Local-first wellness companion for the GX10 hackathon. Read `docs/TEAM_PLAN.md` (your role), then the phase you're on in `docs/PROJECT_PLAN.md`. Decisions are in `docs/DECISIONS.md`; §3c of the plan is the API contract.

## Run and test
- `npm install` at the root (npm workspaces; `web/` has its own `npm install`).
- `INFERENCE_PROVIDER=fake npm run dev`: API on 127.0.0.1:8000 with the fake model. `cd web && npm run dev` proxies `/api` to it.
- Real model: copy `.env.example` to `.env` (untracked), set `LOCAL_AI_API_KEY` from `~/.config/innercove/lmstudio.token`, set `INFERENCE_PROVIDER=lmstudio`.
- `npm test` (vitest), `npm run typecheck`, `npm run validate` (B's contract checks).
- `sudo docker compose up -d --build`: the demo build (web + API in one container, host network, 127.0.0.1:8000).
- Phase 0 scripts: `scripts/run_eval.py`, `scripts/smoke-inference.py` (stdlib Python; env as above).

## Layout and owners
| Path | What | Owner |
|---|---|---|
| `packages/core/` | Zod contracts, data-layer ports (`@innercove/core`) | B |
| `core/inference/` | Provider interface, LM Studio + Fake providers, reasoning stripper | A |
| `core/chat/` | `/api/chat` and `/api/infer` request and SSE event types | A |
| `core/safety/`, `config/` | Safety rules, crisis resources, reviewed tier-2 replies, prompts | D |
| `server/` | Fastify app; `routes/chat.ts`, `routes/health.ts` are A's, data routes are B's | A, B |
| `store/` | SQLCipher DB, schema, migrations, repos (Phase 2) | B |
| `web/` | React SPA; `App.tsx` and the router are C's | C |
| `docs/` | Plan, decisions, team split, GX10 setup log | everyone |

Single owners for hot files: `packages/core` types (B), schema and migrations (B), the chat pipeline (A), `App.tsx`/router (C). Ask before editing someone else's.

## Privacy rules (never break these)
- Never log request or response bodies, prompts, replies or diary text. Errors never echo input. Log event types and IDs only.
- Never persist or display model reasoning; the adapter strips `<think>`, `reasoning_content` and `reasoning` (D13).
- Every query is scoped by `user_id`; AI reads go through B's permission-filtered read port only.
- `/api/infer` (temporary chats) never writes anything (D35).
- Crisis resources come from static config, never from the model (D03). Model output is screened before display (D32).
- Bind 127.0.0.1 only. Never use Docker `ports:` (binds 0.0.0.0, bypasses ufw); LM Studio stays on loopback with auth on (D18).
- The repo is public (D40): no keys, `.env`, tokens, real personal data or private server details. Use the fictional persona only.

## Conventions
- TypeScript, Node 22, ESM (`.js` import suffixes), strict mode. camelCase in JSON/TS, snake_case columns.
- Errors: `{ error: { code, message, details? } }` with the §3c codes.
- IDs are UUIDv7; timestamps ISO-8601 UTC.
- Tests with `FakeProvider` assert on the assembled prompt.

## Git
- Trunk-based: short branches `p<N>-<topic>`, merge to `main` every 2–3 h; `main` must pass `npm test` and `docker compose up`.
- Short commit messages. Pull (rebase) before pushing.
- At the end of a phase, append ≤15 lines to the Phase log in `docs/PROJECT_PLAN.md`.

## GX10
- It's borrowed: log every system change with its undo in `docs/SETUP_LOG.md`.
- Only A uses the GX10 during Phase 0; others use `FakeProvider` or `ssh -L 1234:127.0.0.1:1234 gx10`.
