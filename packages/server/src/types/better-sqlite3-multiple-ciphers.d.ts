/**
 * The installed version (13.0.3) ships real types at
 * `better-sqlite3-multiple-ciphers/index.d.ts`, but under NodeNext
 * module resolution they can't be resolved through the package's own
 * `exports` map (a packaging rough edge in the upstream package, not
 * a mistake in this repo -- confirmed by reading its package.json).
 * This re-exports the same shape better-sqlite3's own published types
 * describe, since better-sqlite3-multiple-ciphers is an API-compatible
 * drop-in replacement (same constructor, same `.pragma()`/`.prepare()`
 * surface) -- not a guess at a different API.
 */
declare module "better-sqlite3-multiple-ciphers" {
  import BetterSqlite3 from "better-sqlite3";
  export = BetterSqlite3;
}
