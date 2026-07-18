import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The SQLite lockout table. `first_failure_at` / `last_failure_at` are 64-bit
 * `integer` epochs (ms) — the store does arithmetic on them (window reset from
 * the first, cooloff from the last). Add the returned table to your Drizzle
 * schema and migration.
 */
export function sqliteLockoutTable(name = 'lockout_attempts') {
  return sqliteTable(name, {
    key: text('key').primaryKey(),
    failures: integer('failures').notNull(),
    firstFailureAt: integer('first_failure_at', { mode: 'number' }).notNull(),
    lastFailureAt: integer('last_failure_at', { mode: 'number' }).notNull(),
  });
}

export type SqliteLockoutTable = ReturnType<typeof sqliteLockoutTable>;
