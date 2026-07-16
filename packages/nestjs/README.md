# @nest-native/lockout

<p align="center">A thin NestJS adapter over <a href="https://www.npmjs.com/package/@authlock/core"><code>@authlock/core</code></a> — django-axes-style login lockout for NestJS apps, wired through a guard, a service, and a dynamic module.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@nest-native/lockout"><img src="https://img.shields.io/npm/v/@nest-native/lockout.svg" alt="NPM Version" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="Package License" /></a>
</p>

> [!WARNING]
> **Pre-release scaffold (`0.0.0`).** The repository foundation is in place; the
> module, guard, and service are not implemented yet. The API below is the
> planned contract.

## Honest by design: NestJS has no login-failure signal

Django's `django-axes` hooks into the framework's ambient `user_login_failed`
signal, so it can be install-and-forget. **NestJS has no equivalent signal
bus**, so this adapter *cannot* be. It gives you explicit wiring instead:

- **`LockoutGuard`** — applied **before** your authentication guard, it rejects
  a request whose identity is currently locked (HTTP 429 + `Retry-After`).
- **`LockoutService`** — you call `reportFailure(...)` / `reportSuccess(...)`
  from your own login handler (or a Passport strategy) so the engine can count
  failures and reset on success. A documented Passport recipe ships with it.
- **`LockoutModule.forRoot(...)` / `forRootAsync(...)`** — configure the
  policy, the store (in-memory or Drizzle), the identity extractors, and
  `failMode` (`'open'` by default, `'closed'` for high-security).

All of it builds on stable Nest primitives (`CanActivate`, `DynamicModule`,
`HttpException`), so the package supports **NestJS 10, 11, and 12**.

## Relationship to `@authlock/core`

This package is a thin DI shell. All the lockout logic — failure counting,
tiered cooloff, the pluggable store, fail-open/closed — lives in the
framework-agnostic [`@authlock/core`](../core) engine, which you can also
use directly from Express or any other framework. If you want request-rate
limiting rather than failed-auth lockout, use
[`@nestjs/throttler`](https://www.npmjs.com/package/@nestjs/throttler) instead.

MIT licensed. Part of the [nest-native](https://github.com/nest-native) family.
Not affiliated with the NestJS core team or the django-axes project.
