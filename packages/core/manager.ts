import { deriveKeys } from './key';
import {
  cooloffFor,
  effectiveWindowMs,
  evaluateRecord,
  type EvaluationConfig,
  type RecordEvaluation,
} from './policy';
import type {
  CooloffTier,
  FailMode,
  FailureRecord,
  Identifiers,
  LockoutDecision,
  LockoutManagerOptions,
  LockoutParameter,
  LockoutStore,
  Normalize,
} from './interfaces';

/**
 * Reject tier configurations that would silently weaken or disable the control.
 * A tier with a non-positive cooloff never locks; a non-integer/NaN `atFailures`
 * never matches the integer failure count (dead config); duplicate thresholds
 * make the cooloff order-dependent; and a NON-MONOTONIC schedule (failing MORE
 * yields a SHORTER lock) lets an attacker self-unlock early by failing more.
 */
function validateTiers(cooloffMs: number, tiers?: readonly CooloffTier[]): void {
  if (tiers === undefined) {
    return;
  }
  const seen = new Set<number>();
  for (const tier of tiers) {
    if (!Number.isInteger(tier.atFailures) || tier.atFailures < 1) {
      throw new TypeError(
        'LockoutManager: each tier `atFailures` must be an integer >= 1.',
      );
    }
    if (!Number.isFinite(tier.cooloffMs) || tier.cooloffMs <= 0) {
      throw new TypeError(
        'LockoutManager: each tier `cooloffMs` must be a positive number.',
      );
    }
    if (seen.has(tier.atFailures)) {
      throw new TypeError(
        `LockoutManager: duplicate tier atFailures ${tier.atFailures}.`,
      );
    }
    seen.add(tier.atFailures);
  }
  // The full schedule — base cooloff, then each tier by ascending atFailures —
  // must be non-decreasing, so a later (higher-failure) tier can never shorten
  // the lock below an earlier one.
  const ordered = [...tiers].sort((a, b) => a.atFailures - b.atFailures);
  let previous = cooloffMs;
  for (const tier of ordered) {
    if (tier.cooloffMs < previous) {
      throw new TypeError(
        'LockoutManager: tier cooloffMs must be non-decreasing by atFailures ' +
          '(a higher failure count must not lock for less time).',
      );
    }
    previous = tier.cooloffMs;
  }
}

/**
 * Reject a `normalize` map whose entries are not functions — a non-function
 * normalizer would throw (or silently no-op) inside key derivation, on the hot
 * auth path, long after startup. Fail loud instead.
 */
function validateNormalize(normalize?: Normalize): void {
  if (normalize === undefined) {
    return;
  }
  for (const [dimension, fn] of Object.entries(normalize)) {
    if (typeof fn !== 'function') {
      throw new TypeError(
        `LockoutManager: normalize['${dimension}'] must be a function.`,
      );
    }
  }
}

function notLocked(): LockoutDecision {
  return { locked: false, retryAfterMs: null };
}

/** Promote a per-key evaluation to a decision, tagging the tripped parameter. */
function toDecision(
  evaluation: RecordEvaluation,
  parameter: LockoutParameter,
): LockoutDecision {
  if (!evaluation.locked) {
    return notLocked();
  }
  return {
    locked: true,
    retryAfterMs: evaluation.retryAfterMs,
    trippedParameter: parameter,
  };
}

/** Fold two decisions into the more restrictive one (locked wins; longer wins). */
function mostRestrictive(
  a: LockoutDecision,
  b: LockoutDecision,
): LockoutDecision {
  if (!b.locked) {
    return a;
  }
  if (!a.locked) {
    return b;
  }
  // Both are locked, so both carry a positive `retryAfterMs` by construction.
  return b.retryAfterMs! > a.retryAfterMs! ? b : a;
}

/**
 * The policy engine. Framework-agnostic and store-agnostic: it derives the keys
 * for an identity, asks the {@link LockoutStore} for each count, applies the
 * lockout policy, and reports a decision. It never binds to a database, a DI
 * container, or a web framework.
 *
 * An identity is locked when ANY configured parameter's key has reached the
 * failure limit within its cooloff window; the returned decision reflects the
 * most restrictive tripped key. On a store error the manager fails OPEN by
 * default (allow the attempt and log) so a database blip cannot lock every user
 * out; `failMode: 'closed'` denies instead.
 */
export class LockoutManager {
  private readonly store: LockoutStore;
  private readonly parameters: readonly LockoutParameter[];
  private readonly normalize?: Normalize;
  private readonly limit: number;
  private readonly cooloffMs: number;
  private readonly windowMs: number;
  private readonly evaluation: EvaluationConfig;
  private readonly failMode: FailMode;
  private readonly resetOnSuccess: boolean;
  private readonly whitelist?: (id: Identifiers) => boolean | Promise<boolean>;
  private readonly onLockout?: (id: Identifiers, d: LockoutDecision) => void;
  private readonly logger?: (error: unknown, context: string) => void;
  private readonly now: () => number;

  constructor(options: LockoutManagerOptions) {
    // Fail loud on configuration that would silently DISABLE the control: a
    // non-positive `cooloffMs` never locks, and a `limit` below 1 is nonsense.
    // A misconfigured security control that quietly does nothing is worse than
    // a crash at startup.
    if (!(options.limit >= 1)) {
      throw new TypeError('LockoutManager: `limit` must be at least 1.');
    }
    if (!(options.cooloffMs > 0)) {
      throw new TypeError('LockoutManager: `cooloffMs` must be greater than 0.');
    }
    validateTiers(options.cooloffMs, options.tiers);
    validateNormalize(options.normalize);
    this.store = options.store;
    this.parameters = options.parameters;
    this.normalize = options.normalize;
    this.limit = options.limit;
    this.cooloffMs = options.cooloffMs;
    this.windowMs = effectiveWindowMs(
      options.cooloffMs,
      options.windowMs,
      options.tiers,
    );
    this.evaluation = {
      limit: options.limit,
      cooloffMs: options.cooloffMs,
      windowMs: this.windowMs,
      tiers: options.tiers,
    };
    this.failMode = options.failMode ?? 'open';
    this.resetOnSuccess = options.resetOnSuccess ?? true;
    this.whitelist = options.whitelist;
    this.onLockout = options.onLockout;
    this.logger = options.logger;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Read-only pre-authentication gate: is this identity currently locked? Does
   * NOT count the attempt — call it before checking the credential, then call
   * {@link recordFailure} or {@link recordSuccess} with the outcome.
   */
  async check(id: Identifiers): Promise<LockoutDecision> {
    if (await this.isWhitelisted(id)) {
      return notLocked();
    }
    const now = this.now();
    let decision = notLocked();
    for (const { parameter, key } of deriveKeys(id, this.parameters, this.normalize)) {
      const evaluation = await this.readKey(key, now);
      decision = mostRestrictive(decision, toDecision(evaluation, parameter));
    }
    return decision;
  }

  /**
   * Count one failed attempt against every configured key and return the
   * resulting lock decision. Fires `onLockout` once, on the attempt that first
   * trips a key over the limit.
   */
  async recordFailure(id: Identifiers): Promise<LockoutDecision> {
    if (await this.isWhitelisted(id)) {
      return notLocked();
    }
    const now = this.now();
    let decision = notLocked();
    for (const { parameter, key } of deriveKeys(id, this.parameters, this.normalize)) {
      const keyDecision = await this.applyFailure(id, parameter, key, now);
      decision = mostRestrictive(decision, keyDecision);
    }
    return decision;
  }

  /**
   * Record a successful authentication. Clears the identity's failure counters
   * when `resetOnSuccess` is enabled (the default); a no-op otherwise.
   */
  async recordSuccess(id: Identifiers): Promise<void> {
    if (!this.resetOnSuccess) {
      return;
    }
    if (await this.isWhitelisted(id)) {
      return;
    }
    await this.clearKeys(id);
  }

  /**
   * Administratively unlock an identity — clear every configured key for it,
   * UNCONDITIONALLY. Unlike {@link recordSuccess}, this ignores `resetOnSuccess`
   * and the whitelist: it is the deliberate "unlock this user" action for an
   * admin panel, a support tool, or an unlock-via-email link.
   */
  async reset(id: Identifiers): Promise<void> {
    await this.clearKeys(id);
  }

  /**
   * Administratively clear EVERY lockout counter — the "unlock everyone"
   * incident-response action (a false-positive lockout wave, a store migration,
   * a test reset). Additive and blunt: it does nothing unless you call it, so
   * the default behaviour is unchanged. For unlocking a single identity use
   * {@link reset}; note that with single-dimension parameters `reset({ email })`
   * already clears that email's lock across every IP.
   */
  async resetAll(): Promise<void> {
    try {
      await this.store.clearAll();
    } catch (error) {
      this.log(error, 'store.clearAll');
    }
  }

  private async clearKeys(id: Identifiers): Promise<void> {
    for (const { key } of deriveKeys(id, this.parameters, this.normalize)) {
      try {
        await this.store.clear(key);
      } catch (error) {
        this.log(error, 'store.clear');
      }
    }
  }

  /** Housekeeping: drop records whose window has fully elapsed. */
  async pruneExpired(): Promise<number> {
    const olderThan = this.now() - this.windowMs;
    try {
      return await this.store.clearExpired(olderThan);
    } catch (error) {
      this.log(error, 'store.clearExpired');
      return 0;
    }
  }

  private async applyFailure(
    id: Identifiers,
    parameter: LockoutParameter,
    key: string,
    now: number,
  ): Promise<LockoutDecision> {
    const record = await this.incrementKey(key, now);
    if (record === null) {
      return toDecision(this.storeErrorDecision(), parameter);
    }
    const evaluation = evaluateRecord(record, now, this.evaluation);
    const decision = toDecision(evaluation, parameter);
    if (evaluation.locked && this.isLockEscalation(record.failures)) {
      this.fireOnLockout(id, decision);
    }
    return decision;
  }

  /**
   * True when reaching `failures` is a NEW lock or a step up to a longer tier —
   * i.e. the initial crossing of the limit, or a failure count that just crossed
   * a tier threshold and lengthened the cooloff. Fires `onLockout` once per
   * escalation. Assumes the store increments failures by exactly 1 (the built-in
   * stores do; custom stores must too, per the `LockoutStore` contract).
   */
  private isLockEscalation(failures: number): boolean {
    if (failures === this.limit) {
      return true;
    }
    const tiers = this.evaluation.tiers;
    return (
      cooloffFor(failures, this.cooloffMs, tiers) >
      cooloffFor(failures - 1, this.cooloffMs, tiers)
    );
  }

  private async readKey(key: string, now: number): Promise<RecordEvaluation> {
    let record: FailureRecord | null;
    try {
      record = await this.store.get(key);
    } catch (error) {
      this.log(error, 'store.get');
      return this.storeErrorDecision();
    }
    return evaluateRecord(record, now, this.evaluation);
  }

  private async incrementKey(
    key: string,
    now: number,
  ): Promise<FailureRecord | null> {
    try {
      return await this.store.increment(key, now, this.windowMs);
    } catch (error) {
      this.log(error, 'store.increment');
      return null;
    }
  }

  private storeErrorDecision(): RecordEvaluation {
    if (this.failMode === 'closed') {
      return { locked: true, retryAfterMs: this.cooloffMs };
    }
    return { locked: false, retryAfterMs: null };
  }

  private async isWhitelisted(id: Identifiers): Promise<boolean> {
    if (this.whitelist === undefined) {
      return false;
    }
    try {
      return await this.whitelist(id);
    } catch (error) {
      this.log(error, 'whitelist');
      return false;
    }
  }

  private fireOnLockout(id: Identifiers, decision: LockoutDecision): void {
    if (this.onLockout === undefined) {
      return;
    }
    try {
      this.onLockout(id, decision);
    } catch (error) {
      this.log(error, 'onLockout');
    }
  }

  private log(error: unknown, context: string): void {
    this.logger?.(error, context);
  }
}
