import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  InMemoryLockoutStore,
  LockoutManager,
  VERSION,
  type Identifiers,
} from '../index';

// Acceptance: drive a full login flow using ONLY the public barrel — no web
// framework, no DI container, no database. This is the neutrality proof for the
// core/adapter split: everything needed to lock out brute-force attempts is
// reachable from `@authlock/core` alone. Milestone C4's bare-Express sample
// exercises the same flow over real HTTP.
describe('@authlock/core acceptance (framework-neutral login flow)', () => {
  it('exposes a semver-shaped version', () => {
    assert.match(VERSION, /^\d+\.\d+\.\d+/);
  });

  it('locks a brute-force loop after the limit, then recovers after cooloff', async () => {
    let clock = 0;
    const manager = new LockoutManager({
      store: new InMemoryLockoutStore(),
      limit: 3,
      cooloffMs: 60_000,
      parameters: [['username'], ['ip']],
      now: () => clock,
    });

    const PASSWORD = 'correct horse battery staple';

    async function login(id: Identifiers, password: string) {
      const gate = await manager.check(id);
      if (gate.locked) {
        return { status: 429, retryAfterMs: gate.retryAfterMs };
      }
      if (password !== PASSWORD) {
        await manager.recordFailure(id);
        return { status: 401, retryAfterMs: null };
      }
      await manager.recordSuccess(id);
      return { status: 200, retryAfterMs: null };
    }

    const victim: Identifiers = { username: 'victim', ip: '10.0.0.1' };

    assert.equal((await login(victim, 'wrong')).status, 401);
    assert.equal((await login(victim, 'wrong')).status, 401);
    assert.equal((await login(victim, 'wrong')).status, 401); // 3rd → locks

    // The security property: even the CORRECT password is refused while locked.
    const blocked = await login(victim, PASSWORD);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.retryAfterMs, 60_000);

    // After cooloff the legitimate user gets in and the counter resets.
    clock = 60_000;
    assert.equal((await login(victim, PASSWORD)).status, 200);

    clock = 60_001;
    assert.equal((await login(victim, 'wrong')).status, 401); // fresh window
  });
});
