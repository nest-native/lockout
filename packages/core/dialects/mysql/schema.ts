import { bigint, int, mysqlTable, varchar } from 'drizzle-orm/mysql-core';

/**
 * The MySQL lockout table. `key` is `varchar(64)` — the engine's keys are
 * sha256 hex digests (exactly 64 chars) and MySQL cannot use a `TEXT` column as
 * a primary key without a prefix length. `first_failure_at` is a `bigint` epoch
 * (ms); the store does arithmetic on it for the window reset. Add the returned
 * table to your Drizzle schema and migration.
 */
export function mysqlLockoutTable(name = 'lockout_attempts') {
  return mysqlTable(name, {
    key: varchar('key', { length: 64 }).primaryKey(),
    failures: int('failures').notNull(),
    firstFailureAt: bigint('first_failure_at', { mode: 'number' }).notNull(),
  });
}

export type MysqlLockoutTable = ReturnType<typeof mysqlLockoutTable>;
