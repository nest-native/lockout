// Public type surface for the framework-agnostic `@authlock/core` engine.
// Zero runtime dependencies; no NestJS, no DI, no decorators, no Drizzle here.
// Drizzle is an OPTIONAL peer used only by the `./drizzle` store (milestone C3).

/**
 * Identity dimensions an authentication attempt is keyed on. Apps may add their
 * own string dimensions; an `undefined` value means the dimension is absent for
 * this attempt (a parameter that needs it simply does not apply).
 */
export interface Identifiers {
  username?: string;
  ip?: string;
  userAgent?: string;
  [dimension: string]: string | undefined;
}

/**
 * One combination of dimensions that can independently trip a lock — e.g.
 * `['username']`, `['ip']`, or `['ip', 'userAgent']`. A parameter applies to an
 * attempt only when every one of its dimensions is present on the identifiers.
 */
export type LockoutParameter = ReadonlyArray<string>;

/**
 * Per-dimension value normalizers, applied to each identity value BEFORE it is
 * hashed into a key. This is a security control, not a convenience: without it,
 * `Alice`, `alice`, and `alice ` derive three different counters, so an attacker
 * bypasses the limit by varying case or whitespace on a case-insensitive login.
 * Normalize the dimensions your auth treats as equal (e.g. lowercase + trim the
 * username), and leave the rest (an IP needs no normalization) unlisted.
 */
export type Normalize = Readonly<Record<string, (value: string) => string>>;

/** A persisted failure counter for one resolved key. */
export interface FailureRecord {
  /** Canonical, collision-resistant key derived from (parameter, values). */
  key: string;
  /** Failures accumulated since `firstFailureAt` in the current window. */
  failures: number;
  /**
   * Epoch milliseconds of the first failure in the current window. The window
   * (and therefore how long a run can accumulate) is measured from here, which
   * bounds the maximum lockout an attacker can sustain.
   */
  firstFailureAt: number;
  /**
   * Epoch milliseconds of the MOST RECENT failure. The cooloff is measured from
   * here — every failed attempt re-anchors the lock — so a persistent attacker
   * stays locked with no gaps between escalating tiers.
   */
  lastFailureAt: number;
}

/**
 * Escalating cooloff: once `failures` reaches `atFailures`, a tripped lock lasts
 * `cooloffMs`. The highest reached threshold wins, regardless of array order.
 */
export interface CooloffTier {
  atFailures: number;
  cooloffMs: number;
}

/** What to do when the store itself errors: allow (and log) vs. deny. */
export type FailMode = 'open' | 'closed';

/**
 * The pluggable persistence seam — the only surface a store implements. Every
 * method may be synchronous or return a Promise (the manager awaits either), so
 * an in-memory Map store and an async Drizzle/Postgres store share one contract.
 */
export interface LockoutStore {
  /**
   * ATOMICALLY increment (creating it if absent) the counter for `key`,
   * resetting it to a fresh window when the current one — `windowMs` measured
   * from `firstFailureAt` — has elapsed, and return the resulting record. This
   * MUST be a single atomic operation so counts are never lost across
   * concurrent callers (an undercount would let an attacker exceed the limit).
   */
  increment(
    key: string,
    now: number,
    windowMs: number,
  ): FailureRecord | Promise<FailureRecord>;
  /** Read the current record for `key`, or `null` if none exists. */
  get(key: string): (FailureRecord | null) | Promise<FailureRecord | null>;
  /** Remove the counter for `key` (used by reset-on-success). */
  clear(key: string): void | Promise<void>;
  /**
   * Remove EVERY counter — a bulk administrative reset ("unlock everyone") for
   * incident response. Distinct from {@link clearExpired}, which only drops
   * records past their window; this wipes all of them.
   */
  clearAll(): void | Promise<void>;
  /**
   * Housekeeping: drop records whose window began before `olderThan` (epoch ms).
   * Returns the number of records removed.
   */
  clearExpired(olderThan: number): number | Promise<number>;
}

/** Immutable lockout policy — the rules, independent of any framework or store. */
export interface LockoutPolicy {
  /** Failures allowed before a key is locked (a lock trips at exactly `limit`). */
  limit: number;
  /** Base lock duration, in milliseconds, once a key is locked. */
  cooloffMs: number;
  /**
   * Failure-counting window in milliseconds. Defaults to the effective cooloff
   * (the base, raised to the largest tier cooloff) so a lock is always
   * represented within the window it belongs to.
   */
  windowMs?: number;
  /** Escalating cooloff by failure count. */
  tiers?: readonly CooloffTier[];
  /** Which dimension combinations are evaluated; a lock trips if ANY of them does. */
  parameters: readonly LockoutParameter[];
  /**
   * Per-dimension value normalizers applied before key derivation — the
   * defence against case/whitespace lockout bypass. See {@link Normalize}.
   */
  normalize?: Normalize;
  /** Identities for which locking is skipped entirely (never counted or locked). */
  whitelist?: (id: Identifiers) => boolean | Promise<boolean>;
  /** Clear a key's failures on a successful login. Defaults to `true`. */
  resetOnSuccess?: boolean;
  /** On store error: `'open'` allows and logs (default), `'closed'` denies. */
  failMode?: FailMode;
}

/** The result of a lock evaluation. */
export interface LockoutDecision {
  locked: boolean;
  /**
   * Milliseconds until the lock lifts — for a `Retry-After` header — or `null`
   * when not locked.
   */
  retryAfterMs: number | null;
  /** The parameter that tripped the (most restrictive) lock, if any. */
  trippedParameter?: LockoutParameter;
}

/** Everything needed to construct a `LockoutManager`. */
export interface LockoutManagerOptions extends LockoutPolicy {
  /** The persistence backend. */
  store: LockoutStore;
  /** Fired once when an attempt transitions a key from unlocked into locked. */
  onLockout?: (id: Identifiers, decision: LockoutDecision) => void;
  /** Called with `(error, context)` whenever a store operation throws. */
  logger?: (error: unknown, context: string) => void;
  /** Injectable clock returning epoch milliseconds; defaults to `Date.now`. */
  now?: () => number;
}
