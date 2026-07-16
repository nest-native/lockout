import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { InMemoryLockoutStore } from '../store/in-memory';
import { runStoreContract } from './support/store-contract';

// The in-memory store must satisfy the exact same behavioral contract as the
// Drizzle stores.
runStoreContract('in-memory', () => ({ store: new InMemoryLockoutStore() }));

describe('InMemoryLockoutStore', () => {
  it('creates a record on the first increment', () => {
    const store = new InMemoryLockoutStore();
    const record = store.increment('k', 100, 1000);
    assert.deepEqual(record, { key: 'k', failures: 1, firstFailureAt: 100 });
  });

  it('continues the same window on subsequent increments', () => {
    const store = new InMemoryLockoutStore();
    store.increment('k', 100, 1000);
    const record = store.increment('k', 500, 1000);
    assert.deepEqual(record, { key: 'k', failures: 2, firstFailureAt: 100 });
  });

  it('resets to a fresh window once it has elapsed', () => {
    const store = new InMemoryLockoutStore();
    store.increment('k', 100, 1000);
    // 1100 - 100 >= 1000 → the previous window is over, start a new one.
    const record = store.increment('k', 1100, 1000);
    assert.deepEqual(record, { key: 'k', failures: 1, firstFailureAt: 1100 });
  });

  it('returns the stored record, or null when the key is unknown', () => {
    const store = new InMemoryLockoutStore();
    assert.equal(store.get('missing'), null);
    store.increment('k', 100, 1000);
    assert.deepEqual(store.get('k'), {
      key: 'k',
      failures: 1,
      firstFailureAt: 100,
    });
  });

  it('clears a single key', () => {
    const store = new InMemoryLockoutStore();
    store.increment('k', 100, 1000);
    store.clear('k');
    assert.equal(store.get('k'), null);
  });

  it('clearExpired removes only records older than the cutoff and counts them', () => {
    const store = new InMemoryLockoutStore();
    store.increment('old', 100, 100000);
    store.increment('new', 5000, 100000);
    const removed = store.clearExpired(1000); // keep firstFailureAt >= 1000
    assert.equal(removed, 1);
    assert.equal(store.get('old'), null);
    assert.ok(store.get('new'));
  });
});
