import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { drizzle } from 'drizzle-orm/mysql2';

import { MysqlLockoutStore, mysqlLockoutTable } from '../dialects/mysql';

// There is no in-process MySQL (no pglite equivalent), so the MySQL store is
// exercised against the REAL drizzle-mysql2 query builder driving a fake client
// that records the SQL and returns canned results. This proves the store issues
// the correct atomic `ON DUPLICATE KEY UPDATE` (with the windowed CASE), the
// re-select, and the affectedRows delete — and reaches 100% of the store's
// method bodies — without a server. The gated integration spec runs the same
// behavioral contract against a real MySQL.
interface Recorded {
  sql: string;
  values: unknown[];
}

// drizzle-mysql2 runs selects with `rowsAsArray: true`, so canned select rows
// are positional arrays in the SELECT's column order: [key, failures,
// first_failure_at].
function fakeMysql(options: {
  selectRows?: unknown[][];
  deleteAffected?: number;
}) {
  const calls: Recorded[] = [];
  const handler = (arg: unknown, params?: unknown[]) => {
    const sqlText =
      typeof arg === 'object' && arg !== null
        ? (arg as { sql: string }).sql
        : (arg as string);
    const values =
      (typeof arg === 'object' && arg !== null
        ? (arg as { values?: unknown[] }).values
        : params) ?? [];
    calls.push({ sql: sqlText, values });
    const lowered = sqlText.toLowerCase();
    if (lowered.startsWith('select')) {
      return Promise.resolve([options.selectRows ?? [], []]);
    }
    if (lowered.startsWith('delete')) {
      return Promise.resolve([{ affectedRows: options.deleteAffected ?? 0 }, []]);
    }
    return Promise.resolve([{ affectedRows: 1 }, []]); // insert / upsert
  };
  const client = { query: handler, execute: handler };
  const db = drizzle(client as never, { mode: 'default' });
  return { db, calls };
}

const table = mysqlLockoutTable();

describe('MysqlLockoutStore (real drizzle-mysql2 builder, fake client)', () => {
  it('increment issues an atomic windowed upsert then re-reads the row', async () => {
    const { db, calls } = fakeMysql({ selectRows: [['k', 2, 0, 500]] });
    const store = new MysqlLockoutStore(db, table);

    const record = await store.increment('k', 500, 1000);
    assert.deepEqual(record, {
      key: 'k',
      failures: 2,
      firstFailureAt: 0,
      lastFailureAt: 500,
    });

    // Two statements: the upsert, then the re-select (MySQL has no RETURNING).
    assert.equal(calls.length, 2);
    const upsert = calls[0].sql.toLowerCase();
    assert.match(upsert, /insert into/);
    assert.match(upsert, /on duplicate key update/);
    assert.match(upsert, /case when/); // the windowed reset-or-increment
    assert.match(calls[1].sql.toLowerCase(), /^select/);

    // MySQL evaluates SET assignments left-to-right against already-updated
    // values, and drizzle emits them in SCHEMA column-declaration order. The
    // `failures` reset CASE reads `first_failure_at`, so the `failures`
    // ASSIGNMENT must precede the `first_failure_at` assignment, or the window
    // never resets on MySQL. Pin that here (the gated real-MySQL round-trip
    // proves the runtime effect); this guards against a schema column reorder.
    const setClause = upsert.slice(upsert.indexOf('on duplicate key update'));
    assert.ok(
      setClause.indexOf('`failures` =') < setClause.indexOf('`first_failure_at` ='),
      'failures must be assigned before first_failure_at in the MySQL SET clause',
    );
  });

  it('get returns the mapped record when present', async () => {
    const { db } = fakeMysql({ selectRows: [['k', 4, 123, 456]] });
    const store = new MysqlLockoutStore(db, table);
    assert.deepEqual(await store.get('k'), {
      key: 'k',
      failures: 4,
      firstFailureAt: 123,
      lastFailureAt: 456,
    });
  });

  it('get returns null when no row exists', async () => {
    const { db } = fakeMysql({ selectRows: [] });
    const store = new MysqlLockoutStore(db, table);
    assert.equal(await store.get('missing'), null);
  });

  it('clear deletes by key', async () => {
    const { db, calls } = fakeMysql({});
    const store = new MysqlLockoutStore(db, table);
    await store.clear('k');
    assert.equal(calls.length, 1);
    const sql = calls[0].sql.toLowerCase();
    assert.match(sql, /^delete from/);
    assert.match(sql, /`key`/);
  });

  it('clearExpired deletes by cutoff and returns affectedRows', async () => {
    const { db, calls } = fakeMysql({ deleteAffected: 3 });
    const store = new MysqlLockoutStore(db, table);
    assert.equal(await store.clearExpired(1000), 3);
    assert.match(calls[0].sql.toLowerCase(), /^delete from/);
    assert.match(calls[0].sql.toLowerCase(), /first_failure_at/);
  });
});
