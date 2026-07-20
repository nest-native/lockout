import { createHash } from 'node:crypto';

import type { Identifiers, LockoutParameter, Normalize } from './interfaces';

/** A configured parameter paired with the concrete key it resolves to. */
export interface DerivedKey {
  parameter: LockoutParameter;
  key: string;
}

/**
 * Resolve the concrete storage keys for an attempt.
 *
 * For each configured parameter we collect the `[dimension, value]` pairs it
 * names, in the parameter's declared order. A parameter that references a
 * dimension absent from `id` (value `undefined`) does not apply to this attempt
 * and is skipped — locking by IP must not accidentally lump together every
 * request that happens to omit a username. The pairs (dimension names included,
 * so two parameters can never collide) are hashed.
 *
 * The value is hashed (SHA-256, from `node:crypto` — no npm dependency) rather
 * than concatenated so a credential-bearing dimension never appears verbatim in
 * a store, and so arbitrary user input can never collide with or forge another
 * key by embedding the separator.
 *
 * A per-dimension `normalize` map (if given) is applied to each value before it
 * is hashed, so equal-by-policy identities (`Alice` vs `alice`) collapse to one
 * counter — the defence against case/whitespace lockout bypass. It is applied
 * uniformly on every path (check / record / reset) because all of them route
 * through here.
 */
export function deriveKeys(
  id: Identifiers,
  parameters: readonly LockoutParameter[],
  normalize?: Normalize,
): DerivedKey[] {
  const derived: DerivedKey[] = [];
  for (const parameter of parameters) {
    const pairs: Array<[string, string]> = [];
    let applies = true;
    for (const dimension of parameter) {
      const value = id[dimension];
      if (value === undefined) {
        applies = false;
        break;
      }
      const normalizer = normalize?.[dimension];
      pairs.push([dimension, normalizer ? normalizer(value) : value]);
    }
    if (!applies) {
      continue;
    }
    const key = createHash('sha256').update(JSON.stringify(pairs)).digest('hex');
    derived.push({ parameter, key });
  }
  return derived;
}
