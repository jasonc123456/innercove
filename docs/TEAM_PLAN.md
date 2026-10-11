# InnerCove — Team Split
There are four people, in roles A–D. **D has an exam on Monday**, so D's load is reduced and front-loaded.

This file replaces the owner names in `PROJECT_PLAN.md` §5 and §6. API ownership follows plan §3c: A owns chat, infer, health and stats; B owns every other route and the `packages/core` schemas. The phases and acceptance criteria there still apply. Hours are counted from the official start.

## Who does what
| Role | Person | Focus | P0 load |
|---|---|---|---|
| A | Jason | Inference, infrastructure and the chat pipeline. **Integration lead** | ~9 h |
| B | Angela | Encrypted database, APIs, permissions | ~9 h |
| C | Mia | The whole UI | ~9 h |
| D | Meowie | Safety rules, test data and demo content (**reduced load**) | ~5 h, plus ~3 h of content |

Compared with the original plan, retrieval and prompt assembly move from D to A, and the permission tests move from D to B. The external review (D31–D34) added the screen-before-display streaming (A), history exclusion on revocation (A), the "what was sent" panel (C), the deletion checks through the unlocked database (B) and the reviewed tier-2 replies (D).

## D's reduced load: ground rules
- **About 8–10 hours in total, mostly in the first half.** D hands everything off by **hour 10**.
- **D owns no critical-path work after hour 8, and none of the files people often edit at the same time.** D's files don't overlap anyone else's.
- **Every D task has a named backup.** If D needs to stop early, the backup takes over from D's handoff note without waiting to ask.
- **D isn't on a late shift and isn't expected after the handoff.** Presenting at judging is optional.
- **D's work is mostly config data and small functions** that can be tested without the server or the GX10. It can be done in short blocks between study breaks.

## Tasks
### A: inference, infrastructure, chat pipeline (integration lead)
| Hours | Task |
|---|---|
| 0–1.5 | **Phase 0** on the GX10, time-boxed: set up LM Studio (D18), run the 8 checks, rebuild the eval runner from the spec in §5, and run the 40 `prep/` tests with prompt v3 on the 27B. Test other models only if §3b's run order calls for it. D reviews the scores. |
| 2–5 | **Phase 1, server side:** the provider adapter (LM Studio and Fake), reasoning stripping (including tags split across chunks), `/api/health`, `/api/chat` streaming over SSE, the Dockerfile, `docker-compose.yml` bound to 127.0.0.1, and `AGENTS.md`. |
| 5–8 | Wire D's safety pre-screen and output screen into `/api/chat` with **screen-before-display by tier (D32)**: tier 0 streams with a sentence-level lag, tier 1 is buffered and screened, tier 2 sends D's reviewed static reply. Add the test where a planted method detail mid-stream never reaches the client. |
| 8–12 | **Phase 3 core:** the retrieval policy (relevant memories only, top 3–5, plus "Use this memory in this chat", D27), prompt assembly, and **history exclusion on revocation (D33)**, all with `FakeProvider` tests on the assembled prompt. |
| 12–14 | **Phase 6:** integration, the offline test, the `ss -ltnp` check. |
| P1 | **Stretch #2, phone pairing (D31):** the local CA and hub certificate, the HTTPS listener on the LAN for the InnerCove port only, QR token → per-device cookie. Install the CA on the demo phone and test it on the travel router. Later items only if time allows. |
| Backup for | D's safety work. |

### B: data and APIs
**Explicit handoff (2026-10-10, Angela): persona SQL seeding belongs to B for Phase 5. A should not build a parallel seed implementation; use B’s seed tool for Phase 6 integration. This supersedes the seed-owner label in A’s earlier P0 gap table.**
| Hours | Task |
|---|---|
| 0–1 | Agree the zod schemas in `packages/core` with C. |
| 1–3 | Check first that `better-sqlite3-multiple-ciphers` builds on ARM64 with FTS5. Decide on `DB_ENCRYPTION` by **hour 6**. |
| 3–8 | **Phase 2:** opening the SQLCipher database, key derivation, lock and unlock (`423` while locked), the schema and migrations (including `devices`, and `user_id` on every table), the conversation and diary repos, FTS with `secure-delete` (or `optimize` after deletes), `/api/unlock`, `/api/conversations` and `/api/diary`. |
| 8–12 | **Phase 3, API side:** the memory repo, provenance, `/api/memories` and revoke propagation. Also the **permission and user-scoping tests**. |
| 12–14 | **Phase 5, backend:** `/api/settings`, delete-all with `VACUUM`, and the deletion test **through the unlocked database** (canary gone from rows, search, derived items and the next prompt). The encryption state and speed stats for the privacy panel. A seed script that loads D's persona. |
| P1 | **Stretch #1, Summary to share (D34):** the generation endpoint with the one-time consent, a factual JSON-schema summary with a source link for every point, and Markdown export. Later items only if time allows. |
| Backup for | D's persona and seed data. |

### C: frontend
| Hours | Task |
|---|---|
| 0–3 | The app shell and a streaming chat page against `FakeProvider`, laid out mobile-first so it works in phone browsers. |
| 3–8 | The setup and unlock screen, the diary pages, the Save/Temporary switch and the "Use memories" switch. |
| 8–12 | The memory page, the "had access to" chips and **the panel that shows exactly what was sent**, the "Use this memory in this chat" button, and the revocation notice in the chat (D33). The crisis card, the Help button and the support note form, using D's config; from Temporary mode it says "This note will be saved to your diary." |
| 12–14 | The settings page, the privacy panel (acceleration, model, memory, last reply's speed, and an honest "Diary encryption: OFF" if the fallback is on) and the CSP headers. |
| P1 | The UI for stretch #1 (item selection with the consent wording, the editable summary, export) and then stretch #2 (the pairing QR screen). |
| Backup for | D's demo script. |

### D: safety, test data, demo content (reduced load)
| Hours | Task | Backup |
|---|---|---|
| 0–2 | Review Claude's first-pass scores for the Phase 0 model comparison and recommend the chat model together with A. | A |
| 1–2 | **Fill in the ASUS feedback survey.** It's required before judging ends, so do it early. | Anyone |
| 2–7 | **Phase 4 core:** `config/safety-rules.json`, `config/crisis-resources.us.json` and `tests/safety-cases.json` (converted from `prep/safety-tests.json`). `packages/core/src/safety` (D44; was `core/safety`): the tier function (a pure function with golden tests) and the output-screen rules (method details, diagnostic wording). `config/safety-replies.us.json`: **reviewed static tier-2 replies** by category (explicit, method-seeking, overdose with "call 911 now" first, harm to others, abuse), warm and short. **Give A the function's interface by hour 5.** | A |
| 7–9 | Copy `prep/system-prompt.txt` (v3, D28 already applied) into `config/prompts/`. **Review** the fictional persona and diary entries Claude drafted in `prep/demo-persona.json`, which B's seed script loads. A first draft of the demo script. | B (seed data), C (script) |
| By 10 | A handoff note of at most 15 lines in the `PROJECT_PLAN.md` Phase log. **Then D is done.** | — |
| Optional | Rehearse the demo or present at judging. | — |

## Timeline
| Hour | Milestone |
|---|---|
| ~2 | Phase 0 done, chat model chosen, schemas agreed |
| ~6 | `DB_ENCRYPTION` decided |
| ~8 | Safety engine and Phase 2 merged |
| ~10 | D hands off |
| ~14 | **P0 gate:** the demo script passes with the network unplugged |
| 14–17 | Stretch #1: Summary to share (B and C) |
| 17–20 | Stretch #2: phone pairing (A and C), only if #1 is done by ~17 |
| ~20 | Feature freeze |
| 18 | Presenter chosen (D41) |
| 20–24 | **Presenter:** the pitch and two rehearsals on the GX10 (plan §10). **C:** the backup screen recording. **B:** the README. **A:** the wipe before returning the GX10. |

If people sleep, stagger A/B and C so someone is always on the critical path.

## Working rules
- **Merge to `main` every 2–3 hours.** `main` must always pass `docker compose up`.
- **Single owners for files people often edit at the same time:**
  - `packages/core` contracts: B (except `src/api/chat.ts`: A).
  - Repo layout: see D44 and `AGENTS.md`.
  - The schema and migrations: B.
  - The chat pipeline: A.
  - `App.tsx` and the router: C.
- **Only A uses the GX10 during Phase 0.** Everyone else works against `FakeProvider` or through the SSH tunnel.
- **One Claude Code session per person per phase.** Start it with: "Read AGENTS.md, TEAM_PLAN.md (role X) and PROJECT_PLAN.md §Phase N. Do only role X's tasks."
- **Before the closing ceremony,** A wipes `./data` and the LM Studio logs, and the team returns the GX10.
