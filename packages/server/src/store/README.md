# Database foundation (B, Phase 2)

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
see the Phase log. The new Phase 2 repositories/routes and saved-chat adapter
are locally verified only until separately tested on the deployed GX10.

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
changed. Fictional persona seeding into SQL and memory CRUD APIs remain later
work; switching to this server version does not auto-import demo content.

Read ports are scoped to the lease user; approved/eligible memories and
eligible diary entries are returned only when their provenance resolves to
eligible same-user sources. Missing, private or cyclic sources fail closed.
Message-based derived sources have no independent access flag and remain
excluded conservatively, matching the earlier demo adapter's policy, until
Phase 3's permission workflow is implemented. This slice supplies the existing
read seams, not Phase 3 memory APIs or full revoke/re-confirmation workflows.
A's ranking, prompt assembly, safety and D33 exclusion remain unchanged.

C can wire setup/unlock/status, diary CRUD/search, `/api/chat` and conversation
reload to these contracts. C's current mock-only diary/Save UI and lock-screen
crisis/help acceptance remain separate team work. Backend Phase 2 acceptance
is locally covered by `api/data.test.ts` and the expanded compiled-entrypoint
smoke. Whole-team Phase 2 and deployment verification remain incomplete.
