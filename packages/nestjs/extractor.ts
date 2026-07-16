import type { Identifiers } from '@authlock/core';
import type { ExecutionContext } from '@nestjs/common';

interface RequestLike {
  body?: Record<string, unknown>;
  ip?: string;
  headers?: Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * The default identity extractor: `username` from the request body, `ip` from
 * `req.ip`, and `userAgent` from the `user-agent` header.
 *
 * It deliberately reads `req.ip` (the connection address) and NOT
 * `X-Forwarded-For`. Behind a proxy you must configure Nest's `trust proxy`
 * (or supply your own extractor) so `req.ip` reflects a source you actually
 * trust — otherwise an attacker could spoof the IP dimension.
 */
export function defaultExtractor(context: ExecutionContext): Identifiers {
  const request = context.switchToHttp().getRequest<RequestLike>();
  const body = request?.body ?? {};
  const userAgent = request?.headers?.['user-agent'];
  return {
    username: readString(body['username']),
    ip: readString(request?.ip),
    userAgent: readString(userAgent),
  };
}
