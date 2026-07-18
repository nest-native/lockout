import type { CooloffTier, FailureRecord } from './interfaces';

/**
 * The cooloff duration for a given failure count. Tiers escalate: the tier with
 * the highest `atFailures` that is still `<= failures` wins, so
 * `[{atFailures: 3, cooloffMs: A}, {atFailures: 6, cooloffMs: B}]` yields the
 * base below 3, `A` at 3–5, and `B` at 6+. Evaluation is order-independent — an
 * unsorted tier array produces the same result.
 */
export function cooloffFor(
  failures: number,
  cooloffMs: number,
  tiers?: readonly CooloffTier[],
): number {
  let chosen = cooloffMs;
  let bestAt = -Infinity;
  for (const tier of tiers ?? []) {
    if (tier.atFailures <= failures && tier.atFailures > bestAt) {
      bestAt = tier.atFailures;
      chosen = tier.cooloffMs;
    }
  }
  return chosen;
}

/**
 * The window over which failures accumulate. It must be at least as long as the
 * longest lock the policy can impose, otherwise a record could age out of its
 * window while the identity it represents is still meant to be locked. So the
 * effective window is the max of the configured window (if any), the base
 * cooloff, and every tier's cooloff.
 */
export function effectiveWindowMs(
  cooloffMs: number,
  windowMs?: number,
  tiers?: readonly CooloffTier[],
): number {
  let effective = Math.max(windowMs ?? 0, cooloffMs);
  for (const tier of tiers ?? []) {
    if (tier.cooloffMs > effective) {
      effective = tier.cooloffMs;
    }
  }
  return effective;
}

/** The inputs `evaluateRecord` needs beyond the record and the clock. */
export interface EvaluationConfig {
  limit: number;
  cooloffMs: number;
  windowMs: number;
  tiers?: readonly CooloffTier[];
}

/** Whether a single key's record represents a live lock, and for how long. */
export interface RecordEvaluation {
  locked: boolean;
  retryAfterMs: number | null;
}

const NOT_LOCKED: RecordEvaluation = { locked: false, retryAfterMs: null };

/**
 * Decide whether one stored record is currently locked. A record locks when it
 * has reached the failure limit and the cooloff for that failure count has not
 * yet elapsed since the MOST RECENT failure. A record whose window has fully
 * expired (measured from the FIRST failure, which bounds the run), or that is
 * under the limit, is not locked.
 *
 * The two anchors are deliberate: the cooloff runs from `lastFailureAt` so every
 * failed attempt re-locks the identity (no unthrottled gap between escalating
 * tiers), while the window runs from `firstFailureAt` so a run cannot outlive
 * `windowMs` — capping how long an attacker can keep a victim locked out. Since
 * `windowMs >= cooloffFor(failures)` and `lastFailureAt >= firstFailureAt`, the
 * window can only ever cut a lock SHORT (the intended cap), never leave a
 * should-be-locked record reporting unlocked mid-cooloff.
 */
export function evaluateRecord(
  record: FailureRecord | null,
  now: number,
  config: EvaluationConfig,
): RecordEvaluation {
  if (record === null) {
    return NOT_LOCKED;
  }
  if (now - record.firstFailureAt >= config.windowMs) {
    return NOT_LOCKED;
  }
  if (record.failures < config.limit) {
    return NOT_LOCKED;
  }
  const cooloffMs = cooloffFor(record.failures, config.cooloffMs, config.tiers);
  const cooloffRemaining = record.lastFailureAt + cooloffMs - now;
  if (cooloffRemaining <= 0) {
    return NOT_LOCKED;
  }
  // The window cap (from firstFailureAt) can lift the lock sooner than the
  // cooloff would; report the EARLIER of the two so Retry-After never overstates
  // how long the identity is actually locked. windowRemaining is > 0 here
  // because the window-expiry check above already returned for expired records.
  const windowRemaining = record.firstFailureAt + config.windowMs - now;
  const retryAfterMs = Math.min(cooloffRemaining, windowRemaining);
  return { locked: true, retryAfterMs };
}
