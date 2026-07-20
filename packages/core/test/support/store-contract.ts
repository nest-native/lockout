import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type { LockoutStore } from '../../interfaces';

/** A fresh, empty store plus its teardown, produced per test. */
export interface StoreHarness {
  store: LockoutStore;
  teardown?: () => void | Promise<void>;
}

/**
 * The behavioral contract every {@link LockoutStore} must satisfy. Runs against
 * the in-memory store, the Postgres store (hermetically via pglite), the SQLite
 * store (hermetically via better-sqlite3), and — gated — against real Postgres
 * and MySQL servers. One definition, so every backend is held to identical
 * semantics.
 */
export function runStoreContract(
  label: string,
  makeHarness: () => StoreHarness | Promise<StoreHarness>,
): void {
  describe(`LockoutStore contract — ${label}`, () => {
    it('creates, increments (advancing lastFailureAt), then resets after the window', async () => {
      const { store, teardown } = await makeHarness();
      try {
        assert.deepEqual(await store.increment('k', 0, 1000), {
          key: 'k',
          failures: 1,
          firstFailureAt: 0,
          lastFailureAt: 0,
        });
        // Within the window: failures climb, firstFailureAt is pinned, but
        // lastFailureAt advances to `now` (this is what re-anchors the cooloff).
        assert.deepEqual(await store.increment('k', 500, 1000), {
          key: 'k',
          failures: 2,
          firstFailureAt: 0,
          lastFailureAt: 500,
        });
        // 2000 - firstFailureAt(0) >= 1000 → the window is over: a fresh run
        // resets BOTH timestamps to `now`. (On MySQL this is the assignment
        // whose SET ordering the store must get right — real-MySQL gated tests
        // exercise this exact path.)
        assert.deepEqual(await store.increment('k', 2000, 1000), {
          key: 'k',
          failures: 1,
          firstFailureAt: 2000,
          lastFailureAt: 2000,
        });
      } finally {
        await teardown?.();
      }
    });

    it('reads a stored record, or null when the key is unknown', async () => {
      const { store, teardown } = await makeHarness();
      try {
        assert.equal(await store.get('missing'), null);
        await store.increment('k', 100, 1000);
        assert.deepEqual(await store.get('k'), {
          key: 'k',
          failures: 1,
          firstFailureAt: 100,
          lastFailureAt: 100,
        });
      } finally {
        await teardown?.();
      }
    });

    it('clears a single key', async () => {
      const { store, teardown } = await makeHarness();
      try {
        await store.increment('k', 100, 1000);
        await store.clear('k');
        assert.equal(await store.get('k'), null);
      } finally {
        await teardown?.();
      }
    });

    it('clearAll removes every key regardless of age', async () => {
      const { store, teardown } = await makeHarness();
      try {
        await store.increment('a', 100, 100000);
        await store.increment('b', 5000, 100000);
        await store.clearAll();
        assert.equal(await store.get('a'), null);
        assert.equal(await store.get('b'), null);
      } finally {
        await teardown?.();
      }
    });

    it('clearExpired removes only records older than the cutoff and counts them', async () => {
      const { store, teardown } = await makeHarness();
      try {
        await store.increment('old', 100, 100000);
        await store.increment('new', 5000, 100000);
        assert.equal(await store.clearExpired(1000), 1); // firstFailureAt < 1000
        assert.equal(await store.get('old'), null);
        assert.ok(await store.get('new'));
      } finally {
        await teardown?.();
      }
    });

    it('counts concurrent increments exactly — no lost updates', async () => {
      const { store, teardown } = await makeHarness();
      try {
        const CONCURRENCY = 25;
        await Promise.all(
          Array.from({ length: CONCURRENCY }, () =>
            store.increment('c', 0, 100000),
          ),
        );
        const record = await store.get('c');
        assert.equal(record?.failures, CONCURRENCY);
      } finally {
        await teardown?.();
      }
    });
  });
}
