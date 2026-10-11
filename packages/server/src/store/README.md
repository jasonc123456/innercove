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
changed. Fictional persona seeding into SQL remains Phase 5 work; switching
to this server version does not auto-import demo content.

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
and D33 history. Phase 2's recorded GX10 result predates these Phase 3 additions;
this new code still requires isolated ARM64 verification and real UI/Qwen
integration. C must connect its memory CRUD/access/pin pages to these contracts
and verify chips, the exact-sent panel and revocation notice against the SQL
backend. Whole-team Phase 2/3 completion is not claimed. External
SQLCipher/Android interoperability remains unverified and out of this scope.
