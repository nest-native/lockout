import { strict as assert } from 'node:assert';

import { VERSION } from '@authlock/core';

import { formatSteps, runShowcase } from '../src/showcase';

// Smoke test for the framework-free showcase: it proves a plain (non-NestJS)
// consumer resolves `@authlock/core` across the workspace and that the engine
// drives the full failure -> lockout -> cooloff -> reset story end to end.
async function main(): Promise<void> {
  const steps = await runShowcase();

  const byLabel = (label: string) => {
    const step = steps.find((candidate) => candidate.label === label);
    assert.ok(step, `missing showcase step: ${label}`);
    return step;
  };

  // The first two failures do not lock; the third trips the lock.
  assert.equal(byLabel('failure 1').locked, false);
  assert.equal(byLabel('failure 2').locked, false);
  assert.equal(byLabel('failure 3 (trips the lock)').locked, true);

  // While locked, a check reports the base cooloff (60s) as Retry-After.
  const locked = byLabel('check while locked');
  assert.equal(locked.locked, true);
  assert.equal(locked.retryAfterMs, 60_000);

  // The lock lifts after the cooloff, and a success resets the counter so the
  // next failure starts a fresh window (not immediately re-locked).
  assert.equal(byLabel('check after cooloff').locked, false);
  assert.equal(byLabel('failure after success (fresh window)').locked, false);

  console.log(`@authlock/core v${VERSION} — framework-free showcase:`);
  console.log(formatSteps(steps));
  console.log('\nShowcase smoke passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
