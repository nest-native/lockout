import { bigint, integer, pgTable, text } from 'drizzle-orm/pg-core';

/**
 * The Postgres lockout table. Add the returned table to your Drizzle schema and
 * migration. `first_failure_at` / `last_failure_at` are `bigint` epochs (ms)
 * because the store does arithmetic on them (the window reset uses the first,
 * the cooloff uses the last); `key` is the sha256 hex digest produced by the
 * engine's key derivation.
 */
export function pgLockoutTable(name = 'lockout_attempts') {
  return pgTable(name, {
    key: text('key').primaryKey(),
    failures: integer('failures').notNull(),
    firstFailureAt: bigint('first_failure_at', { mode: 'number' }).notNull(),
    lastFailureAt: bigint('last_failure_at', { mode: 'number' }).notNull(),
  });
}

export type PgLockoutTable = ReturnType<typeof pgLockoutTable>;
