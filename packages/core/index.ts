// Public entrypoint for `@authlock/core` — the framework-agnostic, zero-runtime-
// dependency login-lockout engine. Usable from Express, inversify, tsyringe, a
// bare script, or the `@nest-native/lockout` DI adapter.
//
// The Drizzle store ships separately from the `./drizzle` subpath (milestone
// C3). Planned subpaths: `.` (this engine), `./drizzle`, `./sqlite`,
// `./postgres`, `./mysql`, `./testing`. See .plan/01-core.md.

// Types — the public contract.
export type {
  CooloffTier,
  FailMode,
  FailureRecord,
  Identifiers,
  LockoutDecision,
  LockoutManagerOptions,
  LockoutParameter,
  LockoutPolicy,
  LockoutStore,
} from './interfaces';

// The engine.
export { LockoutManager } from './manager';

// The built-in single-instance store.
export { InMemoryLockoutStore } from './store/in-memory';

// Pure, stable utilities — key derivation and the policy maths, exported so
// callers and custom stores can reason about keys and cooloff without the
// manager.
export { deriveKeys, type DerivedKey } from './key';
export {
  cooloffFor,
  effectiveWindowMs,
  evaluateRecord,
  type EvaluationConfig,
  type RecordEvaluation,
} from './policy';

export { VERSION } from './version';
