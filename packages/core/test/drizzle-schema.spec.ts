import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { getTableConfig as mysqlTableConfig } from 'drizzle-orm/mysql-core';
import { getTableConfig as pgTableConfig } from 'drizzle-orm/pg-core';
import { getTableConfig as sqliteTableConfig } from 'drizzle-orm/sqlite-core';

import { mysqlLockoutTable } from '../dialects/mysql';
import { pgLockoutTable } from '../dialects/postgres';
import { sqliteLockoutTable } from '../dialects/sqlite';

// DB-free proof that all three dialect tables agree on the column shape the
// store depends on: a primary-key `key`, and NOT-NULL `failures` /
// `first_failure_at` / `last_failure_at`.
const EXPECTED_COLUMNS = [
  'failures',
  'first_failure_at',
  'key',
  'last_failure_at',
];

function assertShape(config: {
  name: string;
  columns: Array<{ name: string; primary: boolean; notNull: boolean }>;
}) {
  assert.equal(config.name, 'lockout_attempts');
  assert.deepEqual(
    config.columns.map((c) => c.name).sort(),
    EXPECTED_COLUMNS,
  );
  const key = config.columns.find((c) => c.name === 'key');
  assert.ok(key?.primary, 'key must be the primary key');
  assert.ok(
    config.columns.every((c) => c.notNull),
    'every column must be NOT NULL',
  );
}

describe('lockout table schema parity', () => {
  it('postgres table has the expected shape', () => {
    assertShape(pgTableConfig(pgLockoutTable()));
  });

  it('sqlite table has the expected shape', () => {
    assertShape(sqliteTableConfig(sqliteLockoutTable()));
  });

  it('mysql table has the expected shape', () => {
    assertShape(mysqlTableConfig(mysqlLockoutTable()));
  });

  it('honors a custom table name on every dialect', () => {
    assert.equal(pgTableConfig(pgLockoutTable('custom')).name, 'custom');
    assert.equal(sqliteTableConfig(sqliteLockoutTable('custom')).name, 'custom');
    assert.equal(mysqlTableConfig(mysqlLockoutTable('custom')).name, 'custom');
  });
});
