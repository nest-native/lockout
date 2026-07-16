import { eq, lt } from 'drizzle-orm';
import type { MySqlDatabase } from 'drizzle-orm/mysql-core';

import type { FailureRecord, LockoutStore } from '../../interfaces';
import {
  firstFailureValues,
  toFailureRecord,
  windowedIncrementSet,
} from '../common';
import type { MysqlLockoutTable } from './schema';

// Broad enough that any mysql2 Drizzle handle assigns without a cast.
type AnyMySqlDatabase = MySqlDatabase<any, any, any, any>;

/**
 * A {@link LockoutStore} backed by a MySQL Drizzle database (`mysql2`).
 *
 * MySQL has no `RETURNING`, so `increment` runs the atomic
 * `INSERT ... ON DUPLICATE KEY UPDATE` (the counter change itself is a single
 * atomic statement — no lost updates) and then re-reads the row. Under heavy
 * concurrency the re-read may already reflect a later attempt's increment; that
 * is safe for lockout because it can only ever report an EQUAL-OR-HIGHER count,
 * never an undercount that would let an attacker slip past the limit.
 *
 * Bring your own `mysql2` connection and pass the Drizzle handle plus the table
 * from {@link mysqlLockoutTable}.
 */
export class MysqlLockoutStore implements LockoutStore {
  constructor(
    private readonly db: AnyMySqlDatabase,
    private readonly table: MysqlLockoutTable,
  ) {}

  async increment(
    key: string,
    now: number,
    windowMs: number,
  ): Promise<FailureRecord> {
    await this.db
      .insert(this.table)
      .values(firstFailureValues(key, now))
      .onDuplicateKeyUpdate({
        set: windowedIncrementSet(this.table, now, windowMs),
      });
    const rows = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.key, key))
      .limit(1);
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
    // mysql2 delete resolves to `[ResultSetHeader, FieldPacket[]]`; the header's
    // `affectedRows` is the number of rows removed.
    const [header] = await this.db
      .delete(this.table)
      .where(lt(this.table.firstFailureAt, olderThan));
    return header.affectedRows;
  }
}
