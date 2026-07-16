import 'reflect-metadata';

import { strict as assert } from 'node:assert';
import type { AddressInfo } from 'node:net';

import { NestFactory } from '@nestjs/core';

import { createAppModule } from '../src/app';
import { DEMO_PASSWORD } from '../src/auth.controller';

// Boots the NestJS app and drives its /auth/login route over REAL HTTP — the
// end-to-end dogfood for the adapter: LockoutModule + LockoutGuard +
// LockoutService on a real controller. A controllable clock keeps the cooloff
// deterministic.
async function main(): Promise<void> {
  let clock = 0;
  const app = await NestFactory.create(createAppModule(() => clock), {
    logger: false,
    abortOnError: false,
  });
  await app.listen(0, '127.0.0.1');

  const { port } = app.getHttpServer().address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/auth/login`;

  const login = async (password: string) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'ada', password }),
    });
    await response.arrayBuffer();
    return {
      status: response.status,
      retryAfter: response.headers.get('retry-after'),
    };
  };

  try {
    // Three wrong passwords are rejected (401). The third trips the lock, but
    // the guard had already let that request through — the lock takes effect on
    // the next attempt.
    assert.equal((await login('nope')).status, 401);
    assert.equal((await login('nope')).status, 401);
    assert.equal((await login('nope')).status, 401);

    // Now the guard blocks — even the correct password gets 429 + Retry-After.
    const blocked = await login(DEMO_PASSWORD);
    assert.equal(blocked.status, 429);
    assert.ok(blocked.retryAfter, 'Retry-After header must be present');

    // After the cooloff, the correct password succeeds.
    clock = 15 * 60_000;
    assert.equal((await login(DEMO_PASSWORD)).status, 200);

    console.log(
      'NestJS dogfood passed: LockoutGuard returned 429 + Retry-After after ' +
        '3 failures, then 200 once the cooloff elapsed.',
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  // Write synchronously and set exitCode (rather than process.exit, which can
  // truncate a buffered async write) so the failure is never swallowed.
  process.stderr.write(`${error?.stack ?? String(error)}\n`);
  process.exitCode = 1;
});
