import { VERSION as coreVersion } from '@authlock/core';

// Public entrypoint for `@nest-native/lockout` — a thin NestJS DI adapter over
// the framework-agnostic `@authlock/core` engine.
//
// NestJS has no ambient "authentication failed" signal bus (unlike Django's
// `user_login_failed` signal), so this adapter CANNOT be install-and-forget: it
// offers explicit wiring instead. Milestone N1 (see .plan/02-nestjs.md) adds:
//   - `LockoutModule.forRoot(...)` / `forRootAsync(...)`
//   - `LockoutGuard` — reject-if-locked, applied pre-authentication
//   - `LockoutService` — `reportFailure()` / `reportSuccess()` your login
//     handler calls, plus a documented Passport-strategy recipe
//   - configurable identity extractors + `failMode: 'open' | 'closed'`
//
// It builds only on stable Nest primitives (`CanActivate`, `DynamicModule`,
// `HttpException`) so the same code runs on NestJS 10, 11, and 12.
//
// SCAFFOLD: only the version constants are wired up today.
export const VERSION = '0.0.0';

/** The `@authlock/core` engine version this adapter wraps. */
export const CORE_VERSION = coreVersion;
