import { eq, lt } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';

import type { FailureRecord, LockoutStore } from '../../interfaces';
import {
  firstFailureValues,
  toFailureRecord,
  windowedIncrementSet,
} from '../common';
import type { PgLockoutTable } from './schema';

// Broad enough that any Postgres Drizzle handle assigns without a cast —
// node-postgres, postgres-js, pglite, etc.
type AnyPgDatabase = PgDatabase<any, any, any>;

/**
 * A {@link LockoutStore} backed by a Postgres Drizzle database. Correct across
 * concurrent app instances: `increment` is a single atomic
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, so simultaneous failed
 * attempts count exactly once each and can never overshoot the limit unnoticed.
 *
 * Bring your own driver — construct the Drizzle handle with `node-postgres`,
 * `postgres-js`, `pglite`, or any Postgres driver and pass it in with the table
 * from {@link pgLockoutTable}. The store never opens or holds a connection of
 * its own.
 */
export class PostgresLockoutStore implements LockoutStore {
  constructor(
    private readonly db: AnyPgDatabase,
    private readonly table: PgLockoutTable,
  ) {}

  async increment(
    key: string,
    now: number,
    windowMs: number,
  ): Promise<FailureRecord> {
    const rows = await this.db
      .insert(this.table)
      .values(firstFailureValues(key, now))
      .onConflictDoUpdate({
        target: this.table.key,
        set: windowedIncrementSet(this.table, now, windowMs),
      })
      .returning();
    return toFailureRecord(rows[0]);
  }

  async get(key: string): Promise<FailureRecord | null> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.key, key))
      .limit(1);
    return rows.length > 0 ? toFailureRecord(rows[0]) : null;
  }

  async clear(key: string): Promise<void> {
    await this.db.delete(this.table).where(eq(this.table.key, key));
  }

  async clearExpired(olderThan: number): Promise<number> {
    const rows = await this.db
      .delete(this.table)
      .where(lt(this.table.firstFailureAt, olderThan))
      .returning({ key: this.table.key });
    return rows.length;
  }
}
