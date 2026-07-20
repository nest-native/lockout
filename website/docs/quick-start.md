---
sidebar_position: 2
title: Quick Start
---

# Quick Start

## Install

```bash
# framework-agnostic core
npm install @authlock/core

# NestJS apps: the adapter + the core (stores and policy types live in the core)
npm install @nest-native/lockout @authlock/core
```

The Drizzle stores are opt-in — install `drizzle-orm` and your driver only if
you use one:

```bash
npm install drizzle-orm pg        # or better-sqlite3 / mysql2
```

## The framework-agnostic core

Three calls, wired into your own login handler: `check` before the credential,
then `recordFailure` or `recordSuccess` with the outcome.

```ts
import {LockoutManager, InMemoryLockoutStore} from '@authlock/core';

const lockout = new LockoutManager({
  store: new InMemoryLockoutStore(),
  limit: 5, // lock after 5 failures…
  cooloffMs: 15 * 60_000, // …for 15 minutes
  parameters: [['username'], ['ip']], // lock by username OR by IP
});

// 1. Pre-auth gate: reject if locked (read-only, never counts the attempt).
const gate = await lockout.check({username, ip});
if (gate.locked) {
  res.setHeader('Retry-After', Math.ceil(gate.retryAfterMs! / 1000));
  return res.status(429).json({error: 'too many attempts'});
}

// 2. Verify the credential however you like, then report the outcome.
if (await verifyPassword(username, password)) {
  await lockout.recordSuccess({username, ip}); // clears the counters
} else {
  const decision = await lockout.recordFailure({username, ip});
  return res.status(decision.locked ? 429 : 401).json({error: 'invalid'});
}
```

Escalate repeat offenders with **tiered cooloff**, and pick the dimensions that
can trip a lock via `parameters` — a lock trips when **any** of them reaches
the limit:

```ts
const lockout = new LockoutManager({
  store,
  limit: 3,
  cooloffMs: 60_000, // 1 minute at 3 failures…
  tiers: [{atFailures: 10, cooloffMs: 60 * 60_000}], // …1 hour at 10
  parameters: [['username'], ['ip'], ['ip', 'userAgent']],
  whitelist: (id) => id.ip === '10.0.0.1', // never counted or locked
});
```

:::warning Locking by username is a DoS vector
Inherent to identity-based lockout (django-axes has it too): if you lock on
`['username']`, **anyone can lock a victim out of their own account** by
submitting failed logins for that username. Prefer a **combination**
(`['username', 'ip']`) so an attacker must also control the victim's IP, keep a
looser `['ip']` parameter for distributed guessing, and consider a softer
response (CAPTCHA/delay) for the username dimension. The library locks exactly
what you configure — choosing safe `parameters` is your call.
:::

:::danger Never trust a spoofable IP
The classic lockout vulnerability (django-axes, django-defender, DRF apps): if
the `ip` you key on comes from a client-controllable header like
`X-Forwarded-For`, an attacker rotates it to **bypass** IP lockout, or forges a
victim's IP to **lock them out**. Pass the real connection address; only trust a
proxy header if your proxy sets it and strips the client's. The NestJS adapter's
default extractor uses `req.ip` (not `X-Forwarded-For`) — behind a proxy,
configure your platform's `trust proxy` correctly. And **never `whitelist` on a
dimension an attacker can spoof.**
:::

See the [Security & operations](./api-reference.md) notes for identity
normalization, bounding store growth, and the fail-open trade-off, and
[Audit logging](./api-reference.md#audit-logging) for building a forensic trail
from your handler and the `onLockout` hook.

## Unlocking an identity

`recordSuccess` clears the counters on a successful login. For an
administrative unlock — a support tool, an "unlock user" button, an
unlock-via-email link — call `reset`, which clears unconditionally (it ignores
`resetOnSuccess` and the whitelist):

```ts
await lockout.reset({username, ip}); // core
// or, in NestJS: await this.lockout.reset({username, ip});
```

## A shared, durable store

The in-memory store is single-process. For multiple instances (or to survive a
restart) use a Drizzle store — its increment is a **single atomic statement**,
so concurrent failed attempts across nodes count exactly once each:

```ts
import {drizzle} from 'drizzle-orm/node-postgres';
import {LockoutManager} from '@authlock/core';
import {PostgresLockoutStore, pgLockoutTable} from '@authlock/core/postgres';

// Add this table to your Drizzle schema + migration:
export const lockoutAttempts = pgLockoutTable(); // 'lockout_attempts' by default

const lockout = new LockoutManager({
  store: new PostgresLockoutStore(drizzle(pool), lockoutAttempts),
  limit: 5,
  cooloffMs: 15 * 60_000,
  parameters: [['username'], ['ip']],
});
```

`@authlock/core/sqlite` and `@authlock/core/mysql` follow the same shape
(`sqliteLockoutTable` / `mysqlLockoutTable`). The store never opens a
connection — you pass it your Drizzle handle.

## NestJS

NestJS has no ambient login-failure signal, so the adapter is explicit by
design. Register the module once:

```ts
import {Module} from '@nestjs/common';
import {LockoutModule} from '@nest-native/lockout';
import {InMemoryLockoutStore} from '@authlock/core';

@Module({
  imports: [
    LockoutModule.forRoot({
      store: new InMemoryLockoutStore(), // swap for a Drizzle store in production
      limit: 5,
      cooloffMs: 15 * 60_000,
      parameters: [['username'], ['ip']],
    }),
  ],
})
export class AppModule {}
```

Guard the login route (place `LockoutGuard` **before** your auth guard) and
report the outcome from the handler:

```ts
import {Controller, Post, Body, Req, UseGuards} from '@nestjs/common';
import {LockoutGuard, LockoutService} from '@nest-native/lockout';

@Controller('auth')
export class AuthController {
  constructor(private readonly lockout: LockoutService) {}

  @Post('login')
  @UseGuards(LockoutGuard) // 429 + Retry-After if already locked
  async login(@Body() dto: {username: string}, @Req() req) {
    const identity = {username: dto.username, ip: req.ip};
    const user = await this.verify(dto); // your credential check
    if (!user) {
      await this.lockout.reportFailure(identity);
      throw new UnauthorizedException();
    }
    await this.lockout.reportSuccess(identity);
    return this.issueSession(user);
  }
}
```

With `passport-local`, put `LockoutGuard` first so a locked identity is
rejected before Passport runs, and report the failure where the check fails
(the strategy's `validate`, or a catch around `AuthGuard`):

```ts
@UseGuards(LockoutGuard, AuthGuard('local'))
@Post('login')
login(@Req() req) { /* report success here */ }
```

See the [API Reference](./api-reference.md) for every option, and the
[Samples](./samples.md) for full runnable apps.
