import { VERSION } from '@authlock/core';

// A trivial, framework-free use of the `@authlock/core` engine, proving it is
// consumable with zero framework coupling. This grows into the real acceptance
// story — failure-count -> lockout -> cooloff (incl. tiered) -> reset-on-success
// against the in-memory store, then the atomic Drizzle store — as the engine
// lands (see the repo's working plan, PLAN 1 / milestone C2).
export function describeCore(): string {
  return `@authlock/core v${VERSION}`;
}
