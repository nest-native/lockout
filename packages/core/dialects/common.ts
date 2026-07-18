import { sql, type Column, type SQL } from 'drizzle-orm';

import type { FailureRecord } from '../interfaces';

/**
 * The columns every dialect's lockout table must expose for the store to build
 * its atomic windowed increment. Each dialect declares these with its own
 * column types (`bigint`/`integer` for the timestamp, `text`/`varchar` for the
 * key); the shared SQL below only needs the drizzle column references.
 */
export interface LockoutColumns {
  failures: Column;
  firstFailureAt: Column;
}

/**
 * Build the `SET` clause for the atomic upsert: within the window the failure
 * count increments and the window start is preserved; once the window has
 * elapsed (`now - firstFailureAt >= windowMs`) the row resets to a fresh single
 * failure starting `now`. `lastFailureAt` is set to `now` on every increment so
 * the cooloff re-anchors to the latest failure. Expressed as `CASE` over the
 * EXISTING row's columns so the whole thing is one atomic statement — no
 * read-modify-write, no lost updates across concurrent callers.
 *
 * IMPORTANT — column ORDER matters on MySQL, and it is the SCHEMA order that
 * decides it. `ON DUPLICATE KEY UPDATE` evaluates SET assignments left-to-right
 * using ALREADY-UPDATED column values; the `failures` CASE reads
 * `first_failure_at`, so `first_failure_at` must be assigned AFTER `failures`,
 * or the reset predicate reads the new value and the window never resets.
 * Drizzle builds the MySQL SET clause in TABLE COLUMN-DECLARATION order (from
 * `*LockoutTable()`), NOT in the order of the object returned here — so the real
 * invariant lives in each `schema.ts`: `failures` is declared before
 * `first_failure_at` (and `last_failure_at`, read by nothing, comes last). This
 * is a MySQL-only hazard; Postgres/SQLite evaluate every RHS against the
 * pre-update row and are order-independent. A `drizzle-mysql2` test asserts the
 * emitted SET lists `failures` before `first_failure_at`, and a gated real-MySQL
 * round-trip proves the reset actually happens.
 *
 * The timestamps are numeric epochs (ms) on purpose: the reset condition does
 * arithmetic on them, so they cannot be ISO strings.
 */
export function windowedIncrementSet(
  columns: LockoutColumns,
  now: number,
  windowMs: number,
): { failures: SQL; firstFailureAt: SQL; lastFailureAt: number } {
  const windowElapsed = sql`${now} - ${columns.firstFailureAt} >= ${windowMs}`;
  return {
    failures: sql`case when ${windowElapsed} then 1 else ${columns.failures} + 1 end`,
    firstFailureAt: sql`case when ${windowElapsed} then ${now} else ${columns.firstFailureAt} end`,
    lastFailureAt: now,
  };
}

/** The values every dialect inserts for a brand-new key (its first failure). */
export function firstFailureValues(
  key: string,
  now: number,
): { key: string; failures: number; firstFailureAt: number; lastFailureAt: number } {
  return { key, failures: 1, firstFailureAt: now, lastFailureAt: now };
}

/** Narrow a stored row to the public {@link FailureRecord} shape. */
export function toFailureRecord(row: {
  key: string;
  failures: number;
  firstFailureAt: number;
  lastFailureAt: number;
}): FailureRecord {
  return {
    key: row.key,
    failures: row.failures,
    firstFailureAt: row.firstFailureAt,
    lastFailureAt: row.lastFailureAt,
  };
}
