import { after, describe, it } from 'node:test';

import { MysqlLockoutStore, mysqlLockoutTable } from '../../dialects/mysql';
import { PostgresLockoutStore, pgLockoutTable } from '../../dialects/postgres';
import type { StoreHarness } from '../support/store-contract';
import { runStoreContract } from '../support/store-contract';

// Gated round-trips against REAL Postgres + MySQL servers. These load only when
// their URL is set (CI's dedicated store job, or `npm run infra:up` +
// `npm run test:full` locally). Drivers are imported dynamically so a missing
// optional dependency never breaks collection. The default `npm test` and the
// coverage gate never touch this file (it lives under test/integration).
const POSTGRES_URL = process.env.LOCKOUT_POSTGRES_URL;
const MYSQL_URL = process.env.LOCKOUT_MYSQL_URL;

const cleanups: Array<() => Promise<void>> = [];
after(async () => {
  for (const cleanup of cleanups) {
    await cleanup();
  }
});

const PG_DDL = `CREATE TABLE IF NOT EXISTS lockout_attempts (
  key text PRIMARY KEY,
  failures integer NOT NULL,
  first_failure_at bigint NOT NULL,
  last_failure_at bigint NOT NULL
)`;

const MYSQL_DDL = `CREATE TABLE IF NOT EXISTS lockout_attempts (
  \`key\` varchar(64) PRIMARY KEY,
  failures int NOT NULL,
  first_failure_at bigint NOT NULL,
  last_failure_at bigint NOT NULL
)`;

if (POSTGRES_URL) {
  let ready: { store: PostgresLockoutStore; clear: () => Promise<void> } | null =
    null;
  async function harness(): Promise<StoreHarness> {
    if (!ready) {
      const { Pool } = await import('pg');
      const { drizzle } = await import('drizzle-orm/node-postgres');
      const pool = new Pool({ connectionString: POSTGRES_URL });
      await pool.query(PG_DDL);
      cleanups.push(async () => {
        await pool.query('DROP TABLE IF EXISTS lockout_attempts');
        await pool.end();
      });
      ready = {
        store: new PostgresLockoutStore(drizzle(pool), pgLockoutTable()),
        clear: async () => {
          await pool.query('DELETE FROM lockout_attempts');
        },
      };
    }
    await ready.clear();
    return { store: ready.store };
  }
  runStoreContract('postgres (real server)', harness);
} else {
  describe(
    'postgres (real server)',
    { skip: 'LOCKOUT_POSTGRES_URL is not set' },
    () => {
      it('is skipped without a database URL', () => {});
    },
  );
}

if (MYSQL_URL) {
  let ready: { store: MysqlLockoutStore; clear: () => Promise<void> } | null =
    null;
  async function harness(): Promise<StoreHarness> {
    if (!ready) {
      const mysql = await import('mysql2/promise');
      const { drizzle } = await import('drizzle-orm/mysql2');
      const connection = await mysql.createConnection(MYSQL_URL as string);
      await connection.query(MYSQL_DDL);
      cleanups.push(async () => {
        await connection.query('DROP TABLE IF EXISTS lockout_attempts');
        await connection.end();
      });
      ready = {
        store: new MysqlLockoutStore(
          drizzle(connection, { mode: 'default' }),
          mysqlLockoutTable(),
        ),
        clear: async () => {
          await connection.query('DELETE FROM lockout_attempts');
        },
      };
    }
    await ready.clear();
    return { store: ready.store };
  }
  runStoreContract('mysql (real server)', harness);
} else {
  describe(
    'mysql (real server)',
    { skip: 'LOCKOUT_MYSQL_URL is not set' },
    () => {
      it('is skipped without a database URL', () => {});
    },
  );
}
