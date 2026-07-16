import { deriveKeys } from './key';
import {
  effectiveWindowMs,
  evaluateRecord,
  type EvaluationConfig,
  type RecordEvaluation,
} from './policy';
import type {
  FailMode,
  FailureRecord,
  Identifiers,
  LockoutDecision,
  LockoutManagerOptions,
  LockoutParameter,
  LockoutStore,
} from './interfaces';

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
    this.store = options.store;
    this.parameters = options.parameters;
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
    for (const { parameter, key } of deriveKeys(id, this.parameters)) {
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
    for (const { parameter, key } of deriveKeys(id, this.parameters)) {
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
    for (const { key } of deriveKeys(id, this.parameters)) {
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
    if (record.failures === this.limit && evaluation.locked) {
      this.fireOnLockout(id, decision);
    }
    return decision;
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
