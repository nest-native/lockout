import { strict as assert } from 'node:assert';
import type { AddressInfo } from 'node:net';

import { createApp } from '../src/app';

// Drives the Express app over REAL HTTP and asserts the lockout behaviour end to
// end. This is the acceptance guardrail for the core/adapter split: everything
// here uses only `@authlock/core` and `express` — proof the engine has zero
// framework coupling. A controllable clock makes the cooloff deterministic.
const CORRECT_PASSWORD = 'correct horse battery staple';

async function main(): Promise<void> {
  let clock = 0;
  const app = createApp(() => clock);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/login`;

  const login = async (password: string) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'ada', password }),
    });
    await response.arrayBuffer(); // drain the body so the socket is freed
    return {
      status: response.status,
      retryAfter: response.headers.get('retry-after'),
    };
  };

  try {
    // Two wrong passwords are rejected but not yet locked.
    assert.equal((await login('nope')).status, 401);
    assert.equal((await login('nope')).status, 401);

    // The third failure trips the lock and sends a Retry-After.
    const tripped = await login('nope');
    assert.equal(tripped.status, 429);
    assert.ok(tripped.retryAfter, 'Retry-After header must be present when locked');

    // While locked, even the CORRECT password is refused.
    assert.equal((await login(CORRECT_PASSWORD)).status, 429);

    // After the cooloff elapses, the correct password gets in.
    clock = 15 * 60_000;
    assert.equal((await login(CORRECT_PASSWORD)).status, 200);

    console.log(
      'Express neutrality sample passed: 3 failures -> 429 + Retry-After, ' +
        'correct password refused while locked, allowed after cooloff. ' +
        'No NestJS or DI container imported.',
    );
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
