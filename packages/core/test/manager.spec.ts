import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { LockoutManager } from '../manager';
import { InMemoryLockoutStore } from '../store/in-memory';
import type { FailureRecord, Identifiers, LockoutStore } from '../interfaces';

/** A store whose every operation throws — for the fail-open / fail-closed paths. */
class ThrowingStore implements LockoutStore {
  increment(_key: string, _now: number, _windowMs: number): FailureRecord {
    throw new Error('increment boom');
  }
  get(_key: string): FailureRecord | null {
    throw new Error('get boom');
  }
  clear(_key: string): void {
    throw new Error('clear boom');
  }
  clearExpired(_olderThan: number): number {
    throw new Error('clearExpired boom');
  }
}

/** A settable fake clock. */
function clock(start = 0) {
  const state = { t: start };
  return {
    now: () => state.t,
    set: (t: number) => {
      state.t = t;
    },
    advance: (dt: number) => {
      state.t += dt;
    },
  };
}

const alice: Identifiers = { username: 'alice', ip: '1.2.3.4' };
const NOT_LOCKED = { locked: false, retryAfterMs: null };

describe('LockoutManager — basic lifecycle', () => {
  it('reports not-locked for an identity with no failures', async () => {
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 3,
      cooloffMs: 1000,
      parameters: [['username']],
    });
    assert.deepEqual(await manager.check(alice), NOT_LOCKED);
  });

  it('is not locked when no configured parameter applies to the identity', async () => {
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 1,
      cooloffMs: 1000,
      parameters: [['username']],
    });
    // No username on the identity → no keys derived → nothing to lock.
    assert.deepEqual(await manager.recordFailure({ ip: '1.2.3.4' }), NOT_LOCKED);
    assert.deepEqual(await manager.check({ ip: '1.2.3.4' }), NOT_LOCKED);
  });

  it('locks after the failure limit and reports retry-after, firing onLockout once', async () => {
    const c = clock(0);
    const locks: Array<number | null> = [];
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 3,
      cooloffMs: 1000,
      parameters: [['username']],
      now: c.now,
      onLockout: (_id, d) => locks.push(d.retryAfterMs),
    });

    assert.equal((await manager.recordFailure(alice)).locked, false);
    assert.equal((await manager.recordFailure(alice)).locked, false);

    const third = await manager.recordFailure(alice);
    assert.equal(third.locked, true);
    assert.equal(third.retryAfterMs, 1000);
    assert.deepEqual(third.trippedParameter, ['username']);

    const checked = await manager.check(alice);
    assert.equal(checked.locked, true);
    assert.equal(checked.retryAfterMs, 1000);

    assert.equal(locks.length, 1); // fired once, on the transition

    // A further failure stays locked, counts down retry-after, and does NOT
    // re-fire onLockout.
    c.advance(100);
    const fourth = await manager.recordFailure(alice);
    assert.equal(fourth.locked, true);
    assert.equal(fourth.retryAfterMs, 900);
    assert.equal(locks.length, 1);
  });

  it('unlocks once the cooloff elapses', async () => {
    const c = clock(0);
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 2,
      cooloffMs: 1000,
      parameters: [['username']],
      now: c.now,
    });
    await manager.recordFailure(alice);
    await manager.recordFailure(alice);
    assert.equal((await manager.check(alice)).locked, true);
    c.set(1000); // cooloff (and the equal-length window) has elapsed
    assert.deepEqual(await manager.check(alice), NOT_LOCKED);
  });
});

describe('LockoutManager — reset on success', () => {
  it('clears failures on success by default', async () => {
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 3,
      cooloffMs: 1000,
      parameters: [['username']],
    });
    await manager.recordFailure(alice);
    await manager.recordFailure(alice);
    await manager.recordSuccess(alice);
    // Without the reset, the next failure would be the 3rd and would lock.
    assert.equal((await manager.recordFailure(alice)).locked, false);
    assert.equal((await manager.recordFailure(alice)).locked, false);
    assert.equal((await manager.recordFailure(alice)).locked, true);
  });

  it('does nothing on success when resetOnSuccess is disabled', async () => {
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 3,
      cooloffMs: 1000,
      parameters: [['username']],
      resetOnSuccess: false,
    });
    await manager.recordFailure(alice);
    await manager.recordFailure(alice);
    await manager.recordSuccess(alice); // no-op
    assert.equal((await manager.recordFailure(alice)).locked, true);
  });
});

describe('LockoutManager — reset (administrative unlock)', () => {
  it('unlocks unconditionally, even when resetOnSuccess is disabled', async () => {
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 2,
      cooloffMs: 1000,
      parameters: [['username']],
      resetOnSuccess: false, // recordSuccess would NOT clear; reset must
    });
    await manager.recordFailure(alice);
    assert.equal((await manager.recordFailure(alice)).locked, true);

    await manager.reset(alice);
    assert.equal((await manager.check(alice)).locked, false);
    // A fresh window — it takes the full limit again to re-lock.
    assert.equal((await manager.recordFailure(alice)).locked, false);
    assert.equal((await manager.recordFailure(alice)).locked, true);
  });

  it('does not short-circuit on the whitelist and swallows store errors', async () => {
    const logged: string[] = [];
    const manager = new LockoutManager({
      store: new ThrowingStore(),
      limit: 2,
      cooloffMs: 1000,
      parameters: [['username']],
      whitelist: () => true,
      logger: (_e, ctx) => logged.push(ctx),
    });
    await manager.reset(alice); // must not throw despite the whitelist + store error
    assert.ok(logged.includes('store.clear'));
  });
});

describe('LockoutManager — configuration validation', () => {
  const store = new InMemoryLockoutStore();

  it('throws when limit is below 1', () => {
    assert.throws(
      () =>
        new LockoutManager({
          store,
          limit: 0,
          cooloffMs: 1000,
          parameters: [['username']],
        }),
      /limit/,
    );
  });

  it('throws when cooloffMs is not positive', () => {
    assert.throws(
      () =>
        new LockoutManager({
          store,
          limit: 2,
          cooloffMs: 0,
          parameters: [['username']],
        }),
      /cooloffMs/,
    );
  });
});

describe('LockoutManager — multi-key evaluation', () => {
  it('locks when ANY configured parameter trips, tagging the tripped parameter', async () => {
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 3,
      cooloffMs: 1000,
      parameters: [['username'], ['ip']],
    });
    // Three different users behind ONE ip: each username key has a single
    // failure, but the shared ip key reaches the limit and trips the lock.
    await manager.recordFailure({ username: 'u1', ip: '9.9.9.9' });
    await manager.recordFailure({ username: 'u2', ip: '9.9.9.9' });
    const trip = await manager.recordFailure({ username: 'u3', ip: '9.9.9.9' });
    assert.equal(trip.locked, true);
    assert.deepEqual(trip.trippedParameter, ['ip']);
  });

  // Two keys locked at once with different cooloffs: the decision must report
  // the LONGEST retry-after. Run it with the long-cooloff key in each fold
  // position so both branches of "most restrictive" are exercised.
  async function tierScenario(
    parameters: ReadonlyArray<ReadonlyArray<string>>,
  ) {
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 2,
      cooloffMs: 1000,
      tiers: [{ atFailures: 4, cooloffMs: 5000 }],
      parameters,
      now: () => 0,
    });
    await manager.recordFailure({ username: 'alice', ip: 'A' }); // u=1, A=1
    await manager.recordFailure({ username: 'alice', ip: 'A' }); // u=2, A=2
    await manager.recordFailure({ username: 'alice', ip: 'B' }); // u=3, B=1
    // u=4 → tier cooloff 5000; B=2 → base cooloff 1000; both locked.
    return manager.recordFailure({ username: 'alice', ip: 'B' });
  }

  it('reports the longest retry-after when username is folded first', async () => {
    const trip = await tierScenario([['username'], ['ip']]);
    assert.equal(trip.locked, true);
    assert.equal(trip.retryAfterMs, 5000);
    assert.deepEqual(trip.trippedParameter, ['username']);
  });

  it('reports the longest retry-after when username is folded last', async () => {
    const trip = await tierScenario([['ip'], ['username']]);
    assert.equal(trip.locked, true);
    assert.equal(trip.retryAfterMs, 5000);
    assert.deepEqual(trip.trippedParameter, ['username']);
  });

  it('does not fire onLockout when the limit is reached but the cooloff already elapsed', async () => {
    const c = clock(0);
    const fired: number[] = [];
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 2,
      cooloffMs: 100,
      // A high tier stretches the window to 10000 without changing the base
      // cooloff, so a record can reach the limit yet already be past cooloff.
      tiers: [{ atFailures: 5, cooloffMs: 10000 }],
      parameters: [['username']],
      now: c.now,
      onLockout: () => fired.push(1),
    });
    await manager.recordFailure(alice); // t=0, failures=1
    c.set(150); // within the 10000 window, but past the 100ms base cooloff
    const second = await manager.recordFailure(alice); // failures=2 == limit
    assert.equal(second.locked, false);
    assert.equal(fired.length, 0);
  });
});

describe('LockoutManager — whitelist', () => {
  it('never locks or counts a whitelisted identity', async () => {
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 2,
      cooloffMs: 1000,
      parameters: [['username']],
      whitelist: (id) => id.username === 'admin',
    });
    for (let i = 0; i < 5; i += 1) {
      assert.deepEqual(
        await manager.recordFailure({ username: 'admin' }),
        NOT_LOCKED,
      );
    }
    assert.deepEqual(await manager.check({ username: 'admin' }), NOT_LOCKED);
    await manager.recordSuccess({ username: 'admin' }); // whitelist short-circuit
  });

  it('still applies lockout to a non-whitelisted identity (async predicate)', async () => {
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 2,
      cooloffMs: 1000,
      parameters: [['username']],
      whitelist: async (id) => id.username === 'admin',
    });
    await manager.recordFailure({ username: 'bob' });
    assert.equal((await manager.recordFailure({ username: 'bob' })).locked, true);
  });

  it('treats a throwing whitelist as not-whitelisted and logs it', async () => {
    const logged: string[] = [];
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 1,
      cooloffMs: 1000,
      parameters: [['username']],
      whitelist: () => {
        throw new Error('whitelist boom');
      },
      logger: (_e, ctx) => logged.push(ctx),
    });
    assert.equal((await manager.recordFailure({ username: 'bob' })).locked, true);
    assert.ok(logged.includes('whitelist'));
  });
});

describe('LockoutManager — fail modes', () => {
  it('fails OPEN on a store error by default (allow + log)', async () => {
    const logged: string[] = [];
    const manager = new LockoutManager({
      store: new ThrowingStore(),
      limit: 2,
      cooloffMs: 1000,
      parameters: [['username']],
      logger: (_e, ctx) => logged.push(ctx),
    });
    assert.deepEqual(await manager.check(alice), NOT_LOCKED);
    assert.deepEqual(await manager.recordFailure(alice), NOT_LOCKED);
    assert.ok(logged.includes('store.get'));
    assert.ok(logged.includes('store.increment'));
  });

  it('fails CLOSED on a store error when configured (deny + retry-after)', async () => {
    const manager = new LockoutManager({
      store: new ThrowingStore(),
      limit: 2,
      cooloffMs: 1000,
      parameters: [['username']],
      failMode: 'closed',
    });
    const checked = await manager.check(alice);
    assert.equal(checked.locked, true);
    assert.equal(checked.retryAfterMs, 1000);
    assert.deepEqual(checked.trippedParameter, ['username']);

    const failed = await manager.recordFailure(alice);
    assert.equal(failed.locked, true);
    assert.equal(failed.retryAfterMs, 1000);
  });

  it('logs (and swallows) a store error during recordSuccess', async () => {
    const logged: string[] = [];
    const manager = new LockoutManager({
      store: new ThrowingStore(),
      limit: 2,
      cooloffMs: 1000,
      parameters: [['username']],
      logger: (_e, ctx) => logged.push(ctx),
    });
    await manager.recordSuccess(alice);
    assert.ok(logged.includes('store.clear'));
  });
});

describe('LockoutManager — onLockout isolation', () => {
  it('isolates a throwing onLockout callback and still returns the decision', async () => {
    const logged: string[] = [];
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 1,
      cooloffMs: 1000,
      parameters: [['username']],
      onLockout: () => {
        throw new Error('callback boom');
      },
      logger: (_e, ctx) => logged.push(ctx),
    });
    const decision = await manager.recordFailure(alice);
    assert.equal(decision.locked, true);
    assert.ok(logged.includes('onLockout'));
  });
});

describe('LockoutManager — pruneExpired', () => {
  it('delegates to the store and returns the removed count', async () => {
    const store = new InMemoryLockoutStore();
    const c = clock(0);
    const manager = new LockoutManager({
      store,
      limit: 3,
      cooloffMs: 1000,
      parameters: [['username']],
      now: c.now,
    });
    await manager.recordFailure({ username: 'a' }); // firstFailureAt = 0
    c.set(100000);
    await manager.recordFailure({ username: 'b' }); // firstFailureAt = 100000
    // window = 1000 → olderThan = 100000 - 1000 = 99000 → only 'a' is expired.
    assert.equal(await manager.pruneExpired(), 1);
  });

  it('returns 0 and logs when the store errors', async () => {
    const logged: string[] = [];
    const manager = new LockoutManager({
      store: new ThrowingStore(),
      limit: 3,
      cooloffMs: 1000,
      parameters: [['username']],
      logger: (_e, ctx) => logged.push(ctx),
    });
    assert.equal(await manager.pruneExpired(), 0);
    assert.ok(logged.includes('store.clearExpired'));
  });
});
