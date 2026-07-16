import type {
  Identifiers,
  LockoutDecision,
  LockoutManager,
} from '@authlock/core';
import { Inject, Injectable } from '@nestjs/common';

import { LOCKOUT_MANAGER } from './tokens';

/**
 * The call site your login handler uses. A thin pass-through to the
 * `@authlock/core` {@link LockoutManager} — all policy lives in the core; this
 * only bridges Nest DI to it.
 *
 * NestJS has no ambient "authentication failed" signal, so YOU call
 * `reportFailure` / `reportSuccess` from your own handler (or Passport
 * strategy) with the outcome. `check` is the read-only pre-auth gate (also used
 * by {@link LockoutGuard}).
 */
@Injectable()
export class LockoutService {
  constructor(
    @Inject(LOCKOUT_MANAGER) private readonly manager: LockoutManager,
  ) {}

  /** Is this identity currently locked? Does not count the attempt. */
  check(identity: Identifiers): Promise<LockoutDecision> {
    return this.manager.check(identity);
  }

  /** Record a failed attempt; returns the resulting lock decision. */
  reportFailure(identity: Identifiers): Promise<LockoutDecision> {
    return this.manager.recordFailure(identity);
  }

  /** Record a successful login; clears the failure counters (reset-on-success). */
  reportSuccess(identity: Identifiers): Promise<void> {
    return this.manager.recordSuccess(identity);
  }
}
