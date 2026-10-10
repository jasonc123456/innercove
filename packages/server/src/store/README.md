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
unresolved sources (D16/D33); owner deletion removes those links. This does
not implement those permission policies or data repositories yet. Inserts must
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
be writable by the container's `node` user. This foundation has only been
verified locally on WSL Linux x64 / Node 22.22.1. Its Docker build/runtime and
GX10 ARM64 validation remain pending; teammate reports for the earlier spike
are not evidence for this new foundation.

A's opt-in `DEV_STORE=demo` and Phase 3 test store remain in-memory and do not
persist to SQLCipher. They are gated by the same database lifecycle; production
`ChatStore`/history/permission ports still need B's repositories.

Next: conversation/diary repositories and APIs, with user-scoping and deletion
checks, then A's saved-chat persistence integration. Phase 2 is incomplete.
