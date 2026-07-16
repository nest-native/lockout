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
 * failure starting `now`. Expressed as `CASE` over the EXISTING row's columns so
 * the whole thing is one atomic statement — no read-modify-write, no lost
 * updates across concurrent callers.
 *
 * `firstFailureAt` is a numeric epoch (ms) on purpose: the reset condition does
 * arithmetic on it, so it cannot be an ISO string.
 */
export function windowedIncrementSet(
  columns: LockoutColumns,
  now: number,
  windowMs: number,
): { failures: SQL; firstFailureAt: SQL } {
  const windowElapsed = sql`${now} - ${columns.firstFailureAt} >= ${windowMs}`;
  return {
    failures: sql`case when ${windowElapsed} then 1 else ${columns.failures} + 1 end`,
    firstFailureAt: sql`case when ${windowElapsed} then ${now} else ${columns.firstFailureAt} end`,
  };
}

/** The values every dialect inserts for a brand-new key (its first failure). */
export function firstFailureValues(
  key: string,
  now: number,
): { key: string; failures: number; firstFailureAt: number } {
  return { key, failures: 1, firstFailureAt: now };
}

/** Narrow a stored row to the public {@link FailureRecord} shape. */
export function toFailureRecord(row: {
  key: string;
  failures: number;
  firstFailureAt: number;
}): FailureRecord {
  return {
    key: row.key,
    failures: row.failures,
    firstFailureAt: row.firstFailureAt,
  };
}
