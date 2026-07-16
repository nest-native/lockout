import { eq, lt } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { FailureRecord, LockoutStore } from '../../interfaces';
import {
  firstFailureValues,
  toFailureRecord,
  windowedIncrementSet,
} from '../common';
import type { SqliteLockoutTable } from './schema';

// Broad enough that any SQLite Drizzle handle assigns without a cast —
// better-sqlite3, libsql, bun:sqlite, etc.
type AnySQLiteDatabase = BaseSQLiteDatabase<'sync' | 'async', any, any, any>;

/**
 * A {@link LockoutStore} backed by a SQLite Drizzle database (e.g.
 * `better-sqlite3`, `libsql`, or `bun:sqlite`). `increment` is a single atomic
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`.
 *
 * SQLite is single-writer: this store is correct for a single-process app or a
 * shared file/libsql database, but it does NOT give you the cross-node counting
 * of a client/server database — reach for the Postgres or MySQL store when you
 * run multiple instances. Bring your own driver and pass the Drizzle handle plus
 * the table from {@link sqliteLockoutTable}.
 */
export class SqliteLockoutStore implements LockoutStore {
  constructor(
    private readonly db: AnySQLiteDatabase,
    private readonly table: SqliteLockoutTable,
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
