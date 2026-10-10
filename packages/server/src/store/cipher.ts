import Database from "better-sqlite3-multiple-ciphers";

/** SQLCipher v4 derives AES-256 keys via PBKDF2-HMAC-SHA512 (256000
 * iterations) and the database's random 16-byte salt. No sidecar key/salt.
 * Domain-prefixing prevents raw-key-looking passphrases bypassing the KDF.
 * Buffer API avoids SQL interpolation; wipe our mutable credential copy. */
export function configureCipher(db: Database.Database, passphrase: string) {
  const credential = Buffer.from(`InnerCove passphrase v1:${passphrase}`, "utf8");
  try {
    db.pragma("cipher='sqlcipher'");
    db.pragma("legacy=4");
    db.pragma("kdf_iter=256000");
    db.pragma("kdf_algorithm=2");
    db.pragma("hmac_algorithm=2");
    db.pragma("hmac_use=1");
    for (const [pragma, expected] of [
      ["cipher", "sqlcipher"], ["legacy", 4], ["kdf_iter", 256000],
      ["kdf_algorithm", 2], ["hmac_algorithm", 2], ["hmac_use", 1], ["legacy_page_size", 4096],
    ] as const) {
      if (String(db.pragma(pragma, { simple: true })) !== String(expected)) throw new Error("Required cipher configuration unavailable");
    }
    if (db.key(credential) !== 0) throw new Error("Database key configuration failed");
  } finally {
    credential.fill(0);
  }
}
