import { bigint, int, mysqlTable, varchar } from 'drizzle-orm/mysql-core';

/**
 * The MySQL lockout table. `key` is `varchar(64)` — the engine's keys are
 * sha256 hex digests (exactly 64 chars) and MySQL cannot use a `TEXT` column as
 * a primary key without a prefix length. `first_failure_at` / `last_failure_at`
 * are `bigint` epochs (ms); the store does arithmetic on them (window reset from
 * the first, cooloff from the last). Add the returned table to your Drizzle
 * schema and migration.
 */
export function mysqlLockoutTable(name = 'lockout_attempts') {
  // COLUMN ORDER IS LOAD-BEARING ON MYSQL: drizzle builds `ON DUPLICATE KEY
  // UPDATE` in this declaration order, and MySQL evaluates it left-to-right
  // against already-updated values. `failures` MUST stay before
  // `first_failure_at` (its reset CASE reads first_failure_at), or the window
  // never resets on MySQL. See dialects/common.ts.
  return mysqlTable(name, {
    key: varchar('key', { length: 64 }).primaryKey(),
    failures: int('failures').notNull(),
    firstFailureAt: bigint('first_failure_at', { mode: 'number' }).notNull(),
    lastFailureAt: bigint('last_failure_at', { mode: 'number' }).notNull(),
  });
}

export type MysqlLockoutTable = ReturnType<typeof mysqlLockoutTable>;
