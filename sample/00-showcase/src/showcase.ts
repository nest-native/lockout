import {
  InMemoryLockoutStore,
  LockoutManager,
  type Identifiers,
  type LockoutDecision,
} from '@authlock/core';

// A framework-free demonstration of the `@authlock/core` engine: no NestJS, no
// DI container, no database — just the zero-dependency manager over its built-in
// in-memory store. It walks the whole story: failed attempts accumulate, the
// identity locks once it trips the limit, a `Retry-After` counts down, the lock
// lifts after the cooloff, and a success resets the counter.

export interface ShowcaseStep {
  label: string;
  locked: boolean;
  retryAfterMs: number | null;
}

/**
 * Run the showcase against a fake clock so the cooloff is deterministic, and
 * return the sequence of decisions for the smoke test to assert on.
 */
export async function runShowcase(): Promise<ShowcaseStep[]> {
  let clock = 0;

  const manager = new LockoutManager({
    store: new InMemoryLockoutStore(),
    limit: 3,
    cooloffMs: 60_000, // 1 minute base cooloff
    tiers: [{ atFailures: 5, cooloffMs: 15 * 60_000 }], // escalate to 15 min at 5
    parameters: [['username'], ['ip']], // lock by username OR by IP
    now: () => clock,
  });

  const identity: Identifiers = { username: 'ada', ip: '203.0.113.7' };
  const steps: ShowcaseStep[] = [];
  const note = (label: string, decision: LockoutDecision) =>
    steps.push({
      label,
      locked: decision.locked,
      retryAfterMs: decision.retryAfterMs,
    });

  // Three failed logins trip the limit; the third locks the identity.
  note('failure 1', await manager.recordFailure(identity));
  note('failure 2', await manager.recordFailure(identity));
  note('failure 3 (trips the lock)', await manager.recordFailure(identity));

  // A pre-auth check now reports locked with the base cooloff as Retry-After.
  note('check while locked', await manager.check(identity));

  // Once the cooloff elapses the identity is free again.
  clock = 60_000;
  note('check after cooloff', await manager.check(identity));

  // A successful login clears the counter, so the next failure starts fresh.
  await manager.recordSuccess(identity);
  note('failure after success (fresh window)', await manager.recordFailure(identity));

  return steps;
}

/** Render the steps as a readable narrative. */
export function formatSteps(steps: ShowcaseStep[]): string {
  return steps
    .map((step) => {
      const state = step.locked
        ? `LOCKED (retry after ${Math.round((step.retryAfterMs ?? 0) / 1000)}s)`
        : 'allowed';
      return `  ${step.label.padEnd(34)} ${state}`;
    })
    .join('\n');
}
