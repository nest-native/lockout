// Public entrypoint for `@nest-native/lockout` — a thin NestJS DI adapter over
// the framework-agnostic `@authlock/core` engine.
//
// NestJS has no ambient "authentication failed" signal bus (unlike Django's
// `user_login_failed` signal), so this adapter is NOT install-and-forget: it
// gives you explicit wiring. Use `LockoutGuard` to reject a locked identity
// before authentication, and call `LockoutService.reportFailure` /
// `reportSuccess` from your own login handler with the outcome.
//
// It builds only on stable Nest primitives (`CanActivate`, `DynamicModule`,
// `HttpException`, `ExecutionContext`) so the same code runs on NestJS 10, 11,
// and 12.

export { LockoutModule } from './lockout.module';
export { LockoutService } from './lockout.service';
export { LockoutGuard } from './lockout.guard';
export { defaultExtractor } from './extractor';
export { LOCKOUT_MANAGER, LOCKOUT_OPTIONS } from './tokens';
export type {
  IdentifierExtractor,
  LockoutModuleAsyncOptions,
  LockoutModuleOptions,
} from './interfaces';

// Stores, the manager, and the policy types come from `@authlock/core` — add it
// to your dependencies and import them directly, e.g.
//   import { InMemoryLockoutStore } from '@authlock/core';

/** This adapter's version. */
export const VERSION = '0.3.1';
