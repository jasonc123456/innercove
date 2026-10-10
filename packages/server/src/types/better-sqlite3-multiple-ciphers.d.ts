/** The driver's exports map omits its types under NodeNext. Keep the
 * upstream better-sqlite3 surface and its additional Buffer key API. */
declare module "better-sqlite3-multiple-ciphers" {
  import BetterSqlite3 from "better-sqlite3";
  const Database: {
    prototype: Database.Database;
    new (filename?: string, options?: BetterSqlite3.Options): Database.Database;
  };
  namespace Database {
    interface Database extends BetterSqlite3.Database {
      key(passphrase: Buffer): number;
    }
  }
  export = Database;
}
