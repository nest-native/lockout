import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The SQLite lockout table. `first_failure_at` is a 64-bit `integer` epoch (ms)
 * — the store does arithmetic on it for the window reset. Add the returned
 * table to your Drizzle schema and migration.
 */
export function sqliteLockoutTable(name = 'lockout_attempts') {
  return sqliteTable(name, {
    key: text('key').primaryKey(),
    failures: integer('failures').notNull(),
    firstFailureAt: integer('first_failure_at', { mode: 'number' }).notNull(),
  });
}

export type SqliteLockoutTable = ReturnType<typeof sqliteLockoutTable>;
