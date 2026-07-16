import type { Identifiers } from '@authlock/core';
import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';

import { defaultExtractor } from './extractor';
import type { IdentifierExtractor, LockoutModuleOptions } from './interfaces';
import { LockoutService } from './lockout.service';
import { LOCKOUT_OPTIONS } from './tokens';

/**
 * Rejects a locked identity with HTTP 429 + `Retry-After` BEFORE the credential
 * is checked. Apply it ahead of your authentication guard:
 *
 * ```ts
 * @UseGuards(LockoutGuard, AuthGuard('local'))
 * ```
 *
 * The guard only reads state (it never counts attempts) — your handler still
 * calls `LockoutService.reportFailure` / `reportSuccess` with the outcome. If
 * the store errors, the decision honours the configured `failMode` (open =
 * allow, closed = deny), because that logic lives in the core manager.
 */
@Injectable()
export class LockoutGuard implements CanActivate {
  private readonly extract: IdentifierExtractor;

  constructor(
    private readonly service: LockoutService,
    @Inject(LOCKOUT_OPTIONS) options: LockoutModuleOptions,
  ) {
    this.extract = options.extractor ?? defaultExtractor;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const identity: Identifiers = this.extract(context);
    const decision = await this.service.check(identity);
    if (!decision.locked) {
      return true;
    }

    const retryAfterSeconds = Math.ceil((decision.retryAfterMs ?? 0) / 1000);
    setRetryAfter(context, retryAfterSeconds);
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: 'Account temporarily locked due to failed attempts.',
        retryAfterMs: decision.retryAfterMs,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

interface ResponseLike {
  setHeader?: (name: string, value: string | number) => unknown;
  header?: (name: string, value: string | number) => unknown;
}

/** Set `Retry-After` on either an Express (`setHeader`) or Fastify (`header`) response. */
function setRetryAfter(context: ExecutionContext, seconds: number): void {
  const response = context.switchToHttp().getResponse<ResponseLike>();
  if (typeof response?.setHeader === 'function') {
    response.setHeader('Retry-After', seconds);
  } else if (typeof response?.header === 'function') {
    response.header('Retry-After', seconds);
  }
}
