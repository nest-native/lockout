import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import { PostgresLockoutStore, pgLockoutTable } from '../dialects/postgres';
import { runStoreContract } from './support/store-contract';

// pglite runs the real Postgres query engine in-process (WASM), so the store's
// actual ON CONFLICT DO UPDATE ... RETURNING is exercised without a server. The
// gated integration spec repeats the same contract against a real Postgres.
const table = pgLockoutTable();
const DDL = `CREATE TABLE lockout_attempts (
  key text PRIMARY KEY,
  failures integer NOT NULL,
  first_failure_at bigint NOT NULL
)`;

runStoreContract('postgres (pglite)', async () => {
  const client = new PGlite();
  await client.exec(DDL);
  const db = drizzle(client);
  return {
    store: new PostgresLockoutStore(db, table),
    teardown: () => client.close(),
  };
});
