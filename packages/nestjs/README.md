# @nest-native/lockout

<p align="center">A thin NestJS adapter over <a href="https://www.npmjs.com/package/@authlock/core"><code>@authlock/core</code></a> — django-axes-style login lockout for NestJS apps, wired through a guard, a service, and a dynamic module.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@nest-native/lockout"><img src="https://img.shields.io/npm/v/@nest-native/lockout.svg" alt="NPM Version" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="Package License" /></a>
</p>

> [!NOTE]
> Published on npm and following semver. Version history is in the
> [changelog](https://github.com/nest-native/lockout/blob/main/CHANGELOG.md).

## Honest by design: NestJS has no login-failure signal

Django's `django-axes` hooks into the framework's ambient `user_login_failed`
signal, so it can be install-and-forget. **NestJS has no equivalent signal
bus**, so this adapter *cannot* be. It gives you explicit wiring instead:

- **`LockoutGuard`** — applied **before** your authentication guard, it rejects
  a request whose identity is currently locked (HTTP 429 + `Retry-After`).
- **`LockoutService`** — you call `reportFailure(...)` / `reportSuccess(...)`
  (and `reset(...)` for an administrative unlock)
  from your own login handler (or a Passport strategy) so the engine can count
  failures and reset on success. A documented Passport recipe ships with it.
- **`LockoutModule.forRoot(...)` / `forRootAsync(...)`** — configure the
  policy, the store (in-memory or Drizzle), the identity extractors, and
  `failMode` (`'open'` by default, `'closed'` for high-security).

All of it builds on stable Nest primitives (`CanActivate`, `DynamicModule`,
`HttpException`), so the package supports **NestJS 10, 11, and 12**.

## Usage

Install the adapter and the core (the core carries the stores and policy types):

```bash
npm install @nest-native/lockout @authlock/core
```

Register the module once:

```ts
import { Module } from '@nestjs/common';
import { LockoutModule } from '@nest-native/lockout';
import { InMemoryLockoutStore } from '@authlock/core';

@Module({
  imports: [
    LockoutModule.forRoot({
      store: new InMemoryLockoutStore(), // swap for a Drizzle store in production
      limit: 5,
      cooloffMs: 15 * 60_000,
      parameters: [['username'], ['ip']],
      // failMode: 'closed', // deny on store errors (default is 'open')
    }),
  ],
})
export class AppModule {}
```

Guard the login route (place `LockoutGuard` **before** your auth guard) and
report the outcome from the handler — NestJS won't tell the engine about
failures, so you make the two calls yourself:

```ts
import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { LockoutGuard, LockoutService } from '@nest-native/lockout';

@Controller('auth')
export class AuthController {
  constructor(private readonly lockout: LockoutService) {}

  @Post('login')
  @UseGuards(LockoutGuard) // 429 + Retry-After if already locked
  async login(@Body() dto: { username: string }, @Req() req: Request) {
    const identity = { username: dto.username, ip: req.ip };
    const user = await this.verify(dto); // your credential check
    if (!user) {
      await this.lockout.reportFailure(identity); // count the failure
      throw new UnauthorizedException();
    }
    await this.lockout.reportSuccess(identity); // reset on success
    return this.issueSession(user);
  }
}
```

### Passport recipe

With `passport-local` the failure happens inside the strategy, so report it
there (or in the controller after `AuthGuard` throws). Put `LockoutGuard` first
so a locked identity is rejected before Passport runs:

```ts
@UseGuards(LockoutGuard, AuthGuard('local'))
@Post('login')
login(@Req() req) {
  // AuthGuard populated req.user; report success here, and report failure from
  // LocalStrategy.validate() (or a catch around AuthGuard) where the check fails.
}
```

## Relationship to `@authlock/core`

This package is a thin DI shell. All the lockout logic — failure counting,
tiered cooloff, the pluggable store, fail-open/closed — lives in the
framework-agnostic [`@authlock/core`](../core) engine, which you can also
use directly from Express or any other framework. If you want request-rate
limiting rather than failed-auth lockout, use
[`@nestjs/throttler`](https://www.npmjs.com/package/@nestjs/throttler) instead.

MIT licensed. Part of the [nest-native](https://github.com/nest-native) family.
Not affiliated with the NestJS core team or the django-axes project.
