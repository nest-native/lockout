import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { SqliteLockoutStore, sqliteLockoutTable } from '../dialects/sqlite';
import { runStoreContract } from './support/store-contract';

// better-sqlite3 runs SQLite in-process, so the store's real ON CONFLICT DO
// UPDATE ... RETURNING is exercised without any external service.
const table = sqliteLockoutTable();
const DDL = `CREATE TABLE lockout_attempts (
  key text PRIMARY KEY,
  failures integer NOT NULL,
  first_failure_at integer NOT NULL,
  last_failure_at integer NOT NULL
)`;

runStoreContract('sqlite (better-sqlite3)', () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(DDL);
  const db = drizzle(sqlite);
  return {
    store: new SqliteLockoutStore(db, table),
    teardown: () => {
      sqlite.close();
    },
  };
});
