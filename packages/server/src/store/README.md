# Encrypted database and persistence (B, Phases 2–3)

The hub starts locked. `POST /api/setup` exclusively creates `data/innercove.db`
(or `DB_PATH`, resolved from the repo root); it never overwrites an existing
file, including an empty one. `POST /api/unlock` checks an actual encrypted
schema read, applies pending migrations, and verifies the seeded identity and
settings before publishing the connection. Five bad credentials trigger a
30-second cooldown (`401` with `Retry-After`). Credentials use the existing
shared request schemas; they are never read from environment variables.

`cipher.ts` selects SQLCipher-compatible v4, PBKDF2-HMAC-SHA512 with 256000
iterations, a random 16-byte salt stored in the encrypted file's header, and
page authentication. The passphrase supplied to the driver's Buffer key API
is UTF-8 `InnerCove passphrase v1:` followed by the user's exact passphrase.
This prefix prevents user input resembling `raw:` or SQLCipher raw-key syntax
from bypassing derivation. The mutable credential copy is zeroed immediately;
closing the native connection zeroes its cipher context. JavaScript request
strings are garbage-collected, not explicitly erasable. No key/salt sidecar,
no automatic plaintext fallback. This slice explicitly rejects
`DB_ENCRYPTION=off`; D26's emergency plaintext mode is not implemented here.
External SQLCipher interoperability remains unverified (see the spike report).

`schema.ts` is the Drizzle mapping. Numbered SQL migrations and
`migrations/meta/_journal.json` are the on-disk schema authority; keep the
mapping consistent when adding a migration. Drizzle applies pending SQL in a
transaction and tracks hashes/versions in `__drizzle_migrations`. Never edit a
migration already shipped; unsupported or changed applied versions fail
closed. The build copies the migration assets to `dist/store/migrations`.

Application tables carry `user_id` (including FTS's unindexed ownership
column); SQLite FTS shadow tables and Drizzle's migration ledger are internal
metadata. Composite foreign keys and polymorphic reference triggers prohibit
cross-user endpoints. Hard deletion removes content and FTS hits. FTS
secure-delete is enabled and checked on both indexes, alongside ordinary
SQLite secure_delete, WAL and temp_store=MEMORY. Content-free source IDs
survive source deletion so later permission/history filtering can reject
unresolved sources (D16/D33); owner deletion removes those links. This
implements the Phase 2 repositories and the read/context/history ports below. Inserts must
explicitly supply `includeInHandoff` after shared-schema defaults are applied;
a database default cannot distinguish a support note from an ordinary entry.

Admitted API requests get `request.databaseLease` (native db, Drizzle mapping,
seeded userId). Use it only during the handler; never retain a handle or launch
unawaited database work. Lock immediately blocks new API work, waits for
admitted handlers, and closes the connection. Aborted clients do not release
a still-running handler's lease. Direct store users must release leases in
`finally`. Fastify shutdown closes the store; the entrypoint handles SIGINT
and SIGTERM. Only GET health/status and POST setup/unlock are allowed while
locked. Static help still works. The existing frontend uses the same origin
or Vite proxy; no CORS policy is added by this slice.

Run from the repo root: `npm run typecheck`, `npm run validate`, `npm test`,
`npm run build`, `npm run spike:sqlcipher --workspace=@innercove/server`,
`npm run smoke:db --workspace=@innercove/server` (compiled entrypoint + HTTP).
Native database dependencies remain in the server workspace. Docker packages
migration assets and provides a writable `/app/data`; a bind mount must also
be writable by the container's `node` user. The foundation passed GX10 host and isolated ARM64 image checks at `8e96d52`;
see the Phase log. The Phase 2 repositories/routes and saved-chat adapter also passed the
expanded production smoke in isolated GX10 ARM64 image
`innercove-phase2-verify:6d8a89c` (Node v22.23.3) on 2026-10-10; build and
combined spike/smoke exits were 0. The detached worktree/container had no
network or live data mounts, and used the smoke/Fake provider. Live
Compose/Qwen/browser integration remains unverified for this implementation.

## Phase 2 repositories and API handoff

`repos/conversations.ts` provides scoped CRUD, recency pagination, ordered
message reads and transactional message append/deletion. Deleting a
conversation hard-deletes its messages and owned context links; content-free
source IDs remain for unresolved-source filtering. `repos/diary.ts` provides
CRUD, FTS5 MATCH search, immutable source provenance, user settings defaults
and D30's stronger support-note privacy defaults. Search includes private
entries in the user's own UI route; AI reads use the filtered port instead.
All routes derive ownership from the request lease, never client `userId`.
Malformed requests/FTS queries return a generic 400; foreign or absent IDs
(including cursors and excerpt sources) return 404 without content.

`api/data.ts` registers the existing §3c conversation and diary routes. Create
returns 201; deletion returns only a content-free tombstone. List routes use
`limit` and an opaque last-ID cursor, ordered by updatedAt descending with ID
as a tie-breaker. Message reads return the most recent `limit` rows oldest
first. A's shared `ConversationHistoryPort` reads the full ordered history so
D33 filtering occurs before A truncates the prompt. An empty PATCH is a no-op;
omitted fields preserve values, explicit null clears nullable fields.

`chat-store.ts` binds A's existing persistence/read/context/history seams to
one admitted request's SQLCipher lease. Completed assistant messages and
context IDs commit atomically via the additive optional
`appendMessageWithContext` port; older test adapters keep their existing
methods. There is no public message-create route. Saved `/api/chat` uses SQL
by default and reloads after lock/reopen or process restart. Temporary
`/api/infer` only reads eligible context; it never persists conversations,
messages, context links or other table changes, and content is never logged.

Normal `main.ts` no longer selects the volatile store via `DEV_STORE=demo`;
the legacy flag is ignored. Existing in-memory adapters/persona helpers stay
available for A's isolated tests, and no deployed GX10 service/config was
changed. Phase 5 now provides an explicit fictional persona seed tool below;
switching to this server version never auto-imports demo content.

Read ports are scoped to the lease user; approved/eligible memories and
eligible diary entries are returned only when their provenance resolves to
eligible same-user sources. Missing, private or cyclic sources fail closed.
Message sources now resolve through the same-user saved message and all its
actual context source IDs. A context-free user message can supply provenance
after explicit creation consent; a reply that used an ineligible source cannot.
A's ranking, prompt assembly, safety and D33 exclusion remain unchanged.

C can wire setup/unlock/status, diary CRUD/search, `/api/chat` and conversation
reload to these contracts. C's current mock-only diary/Save UI and lock-screen
crisis/help acceptance remain separate team work. Backend Phase 2 acceptance
is locally covered by `api/data.test.ts` and the expanded compiled-entrypoint
smoke. Whole-team Phase 2 and deployment verification remain incomplete.

## Phase 3 memory and permission handoff

`repos/memories.ts` and `api/data.ts` implement the existing §3c contracts:
GET/POST `/api/memories`, GET/PATCH/DELETE `/api/memories/:id`, and POST
`/api/memories/:id/review`. Create requires `origin`, `content`, `accessLevel`
and nonempty `sources`; user-written memories use
`[{ sourceType: "manual", sourceId: null }]` and start approved. AI proposals
start proposed and only their dedicated review route can approve/reject them;
reviewing a user-written memory returns 409. PATCH only edits content/access.
No automatic proposal generation or persona seeding is included in Phase 3.
List supports status/origin filters and the existing limit/recency cursor.
Source provenance is immutable, validated before any write and committed
atomically. Foreign or missing IDs/cursors/sources return 404; malformed input
returns generic 400. All routes use the admitted encrypted request lease and
return 423 while locked. UI CRUD lists include the user's private/proposed
records; only the permission-filtered read port can supply AI candidates.

`permissions.ts` is the common provenance policy for read ports, creation and
explicit grants. Creation clamps access to the most restrictive source. Hide,
delete or approved-to-rejected review traverses provenance and reply-context
edges in one transaction, making derived diary/memory items private and
adding content-free revocation tombstones. The private access level is the
durable invalidation flag, including across encrypted reopen. Restoring a
source does not silently restore descendants. C can re-confirm each item via
PATCH `{ accessLevel: "ai_eligible" }` after all its sources are eligible;
otherwise the server returns 409. Missing/deleted/cyclic provenance stays
excluded and cannot be re-confirmed. Approval does not change private access.
Deleting a conversation invalidates items derived from its saved messages
before cascading the messages/context rows. Independent same-user manually
created records remain eligible; foreign records are never traversed.

A's existing retrieval/prompt/history integration consumes these SQL ports.
No chat interfaces were changed. The context event's `sources` gives link IDs
and `sent` gives the exact injected text; existing D33 sends an exchange count
in `historyExcluded`. SQL-backed tests assert the full prompt, relevant top 5
plus pins/top 3 diary entries, hidden/deleted/proposed exclusion, Use memories
off, provenance revocation reaching history and the notice. Temporary infer
with memories enabled leaves every encrypted table unchanged and logs no
content. Existing safety and lease/drain tests remain in the full suite.

Local checks and precise counts are in the Phase log. The compiled HTTP smoke
now also covers memory CRUD/review/provenance, durable revocation/re-confirmation
and D33 history. Operator-reported GX10 verification on 2026-10-10 at
checkout `62989a7` built `innercove-phase3-verify:62989a7` successfully (exit 0).
Runtime linux arm64 / Node v22.23.3 passed the SQLCipher spike 18/18 and the
compiled production smoke (combined exit 0), including setup/lock/unlock,
diary CRUD/FTS, SQL saved chat/reopen with the legacy demo flag, memory
CRUD/review/provenance, durable revocation/re-confirmation, D33 history,
packaged migrations, SIGTERM and plaintext rejection. A separate detached
worktree and container with `--network none` and no live data mounts left the
live deployment unchanged. This closes isolated ARM64 smoke verification,
not real Qwen/UI integration or a full GX10 test-suite run. Undo commands are
recorded in `docs/SETUP_LOG.md` and have not been executed.

The latest A handoff records Phase 2 SQL persistence live on GX10 and a
17-check real-model API demo covering context, D33, temporary chat and safety;
that supersedes the older Phase 2 backend-deployment-pending note, without
verifying these new Phase 3 memory APIs. C’s newer static lock-screen help and
crisis checks are preserved; real setup/unlock, diary and Save/reload UI remain
pending. C must connect its memory CRUD/access/pin pages to these contracts
and verify chips, the exact-sent panel and revocation notice against the SQL
backend. Whole-team Phase 2/3 completion is not claimed. External
SQLCipher/Android interoperability remains unverified and out of this scope.

## Phase 5 settings, content reset and seed handoff

GET/PATCH `/api/settings` use the existing shared settings schemas. Only
`useMemoriesDefault` and `diaryDefaultAccessLevel` are editable; strict input
rejects unknown fields, wrong types and null. Empty PATCH changes nothing;
omitted fields keep their values. Records are scoped to the lease user and
persist across encrypted reopen. C reads these defaults when creating new
saved chats/ordinary diary entries. They do not retrospectively change entry
permissions or A's separate temporary-chat default. D30 support notes remain
private by default even when the ordinary diary default is AI-eligible.
`/api/privacy-status` is reused, including A's runtime/speed fields and B's
encryption/path; no UI, CSP or inference interface changes are included.

POST `/api/delete-all` requires exactly `{ confirm: "DELETE" }`. It is a
DatabaseStore lifecycle operation, not an ordinary leased CRUD handler.
Admission closes immediately after validated confirmation; new protected API
requests return 423 while admitted saved/temporary streams and other request
leases finish. Lifecycle operations serialize with lock/unlock/shutdown, and
the delete handler holds no lease of its own. This prevents a pre-delete
stream from persisting a reply after a successful reset. Success reopens
admission on the same unlocked encrypted connection; no passphrase change or
plaintext fallback occurs. Static help/health/status remain available.

The user-scoped transaction removes conversations, messages, all diary rows
(including support notes/excerpts), memories of every status/access level,
provenance, message-context links and existing tombstones. It creates no new
tombstones. FTS triggers delete postings and both indexes are optimized; WAL
is checkpointed with TRUNCATE before VACUUM and again afterwards. All required
cleanup must succeed before returning `{ deleted: { conversations,
diaryEntries, memories } }`. Identity, credentials, settings, paired devices
and the migration ledger remain; foreign rows/postings are preserved. Nothing
is auto-seeded afterwards. C must discard stale saved IDs/visible cached data
on success; reading an old ID returns 404. Browser-held temporary history is
not server storage and C manages it separately.

Delete-transaction failure rolls back content changes. Compaction failure
after commit may mean content was already removed, but returns a generic 500
and closes the encrypted connection; admission stays locked until explicit
unlock. Neither case echoes input, SQL, diary text or credentials. A retry
with explicit confirmation can complete compaction. No error claims success.

**Persona ownership:** Angela explicitly assigned SQL seeding to B on
2026-10-10, superseding A's earlier gap-table label; TEAM_PLAN and PROJECT_PLAN
record it. No parallel A implementation was found. `store/seed.ts` and
`scripts/seed-persona.mjs` load the existing D-handoff fictional fixture in
`docs/prep/demo-persona.json` unchanged: four user-approved memories, eight
manual diary entries, original access levels/tags/moods and dates at 12:00 UTC,
with manual memory provenance. Persona metadata and live-demo/crisis prompts
are not inserted. Whole-fixture validation and nested repository writes are
atomic. Any existing user content/links/tombstones causes refusal; no overwrite,
implicit delete or duplicate seed occurs. Identity/settings/devices remain.

Run `npm run build` from the repo root first. With the API using the target
database stopped, run:

```sh
npm run seed:persona --workspace=@innercove/server -- --db /path/to/stopped-hub/innercove.db --confirm-fictional
```

The target must already be set up with its passphrase. Enter that passphrase
at the hidden prompt; noninteractive stdin is also supported. Never put it
in argv, an environment variable, logs or a key file. The CLI uses a separate
offline DatabaseStore, unlocks with the existing key, prints counts only and
closes/locks on success or failure. This task tested only scratch databases;
it did not seed, reset, stop or redeploy the live GX10. The tool does not copy
from the in-memory demo adapter or change runtime configuration.

`api/lifecycle-data.test.ts` covers strict settings/defaults/reopen, explicit
reset consent/locking, scoped rows/FTS/derived cleanup, identity/settings/device
retention, both stream modes, queued lock/shutdown, rollback/compaction errors,
WAL checkpoints/VACUUM and the next full prompt with no deleted canary.
`store/seed.test.ts` covers fixture fidelity/private exclusions, atomicity,
reopen and refusal to overwrite. The compiled smoke now covers Phase 5 HTTP
routes, empty post-delete context, persisted settings/reset after restart and
the seed CLI's consent/key/nonempty-store checks. Exact local counts are in
the Phase log; GX10 ARM64 Phase 5 smoke and real C settings/delete/privacy UI
integration remain pending. Whole-team Phase 5 completion is not claimed;
A owns CSP and deployment/offline verification per the latest integration handoff, C owns the UI.

Recovery verification (2026-10-10, local Node v22.22.1): reused the canceled
run’s implementation and reran all checks; no prior Phase 5 pass was assumed.
149/149 tests (13 files), typechecks, 52 contract checks, 30 safety cases,
backend/web builds, SQLCipher spike 18/18 and compiled HTTP/seed smoke passed.
Python scripts compile and `git diff --check` passed. Docker Desktop WSL
integration is unavailable, so no local Compose runtime pass is claimed.
All runtime checks used scratch databases; ARM64/GX10 and real UI checks above
remain open.

Integration with origin/main `6ca2ef8` preserved teammate prompt, safety,
dashboard and saved-chat wiring. The first integrated suite exposed its new
SQLite CLI check missing on WSL; the follow-up keeps the CLI and performs a
real Python SQLite read only when it is absent, asserting process startup.
The final merged suite passed 149/149; merged typechecks/contracts/safety,
backend/web builds and compiled smoke passed again.
