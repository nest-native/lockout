# @authlock/core

<p align="center">A framework-agnostic, django-axes-style login-lockout engine — persistent failed-attempt tracking, failure limits, tiered cooloff, and a pluggable store. Zero runtime dependencies.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@authlock/core"><img src="https://img.shields.io/npm/v/@authlock/core.svg" alt="NPM Version" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="Package License" /></a>
  <img src="https://img.shields.io/badge/coverage-100%25-brightgreen.svg" alt="Test Coverage" />
</p>

> [!NOTE]
> **Unreleased (`0.0.0`).** The engine and all stores are implemented and fully
> tested (100% coverage, plus real Postgres/MySQL round-trips), but the package
> has not been published to npm yet. The first release will be `0.1.0`.

## What it is

`@authlock/core` tracks failed login attempts in a store you already run and
locks an identity out once it trips a failure limit — the classic
[django-axes](https://django-axes.readthedocs.io/) behaviour, ported to
TypeScript and framework-agnostic:

- **Configurable identity dimensions** — key lockout on username, IP, a
  combination, or any custom dimension. A lock trips if **any** configured
  parameter key reaches the limit within the cooloff window.
- **Failure limit → lockout, with cooloff** — including **tiered cooloff**
  (escalate the wait as failures pile up), reset-on-success, a whitelist
  predicate, and a `Retry-After` hint.
- **Pluggable `LockoutStore`** — an in-memory store (single-instance) ships in
  the box; Drizzle-backed Postgres / SQLite / MySQL stores (with an atomic
  cross-instance increment) ship from subpaths.
- **Zero runtime dependencies** — no framework, no DI, no decorators. Use it
  from Express, inversify, tsyringe, a bare script, or via the thin
  [`@nest-native/lockout`](https://www.npmjs.com/package/@nest-native/lockout)
  NestJS adapter.

## Quick start

```ts
import { LockoutManager, InMemoryLockoutStore } from '@authlock/core';

const lockout = new LockoutManager({
  store: new InMemoryLockoutStore(),
  limit: 5, // lock after 5 failures…
  cooloffMs: 15 * 60_000, // …for 15 minutes
  parameters: [['username'], ['ip']], // lock by username OR by IP
});

// In your login handler — identity extraction is YOUR trust decision:
const identity = { username, ip: req.ip };

// 1. Gate before checking the credential.
const gate = await lockout.check(identity);
if (gate.locked) {
  res.setHeader('Retry-After', Math.ceil(gate.retryAfterMs! / 1000));
  return res.status(429).json({ error: 'too many attempts' });
}

// 2. Verify the credential however you like, then report the outcome.
if (await verifyPassword(username, password)) {
  await lockout.recordSuccess(identity); // clears the failure counters
  // …issue a session
} else {
  const decision = await lockout.recordFailure(identity);
  return res.status(decision.locked ? 429 : 401).json({ error: 'invalid' });
}
```

`check` never mutates state, so it is safe to call on every request; `recordFailure`
and `recordSuccess` are the two writes, called with the authentication outcome.
There is no ambient magic — you wire these three calls into your own handler.

## A shared, durable store

The in-memory store is single-process. For multiple instances (or to survive a
restart) use a Drizzle store — the increment is a single atomic statement, so
concurrent failed attempts across nodes count exactly once each:

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { LockoutManager } from '@authlock/core';
import { PostgresLockoutStore, pgLockoutTable } from '@authlock/core/postgres';

// Add this table to your Drizzle schema + migration:
export const lockoutAttempts = pgLockoutTable(); // 'lockout_attempts' by default

const lockout = new LockoutManager({
  store: new PostgresLockoutStore(drizzle(pool), lockoutAttempts),
  limit: 5,
  cooloffMs: 15 * 60_000,
  parameters: [['username'], ['ip']],
});
```

`drizzle-orm` is an **optional** peer — you only need it (and a driver) if you
use a Drizzle store. Bring your own driver: the store never opens a connection.

## Entry points

| Import | Contents |
| --- | --- |
| `@authlock/core` | the engine — `LockoutManager`, `InMemoryLockoutStore`, types, `deriveKeys`, policy helpers |
| `@authlock/core/drizzle` | all three Drizzle stores + table factories (needs `drizzle-orm`, no driver) |
| `@authlock/core/postgres` | `PostgresLockoutStore` + `pgLockoutTable` |
| `@authlock/core/sqlite` | `SqliteLockoutStore` + `sqliteLockoutTable` |
| `@authlock/core/mysql` | `MysqlLockoutStore` + `mysqlLockoutTable` |

## Policy options

| Option | Meaning |
| --- | --- |
| `limit` | failures allowed before a key locks (locks at exactly `limit`) |
| `cooloffMs` | base lock duration once locked |
| `windowMs?` | failure-counting window; defaults to the effective cooloff |
| `tiers?` | escalating cooloff by failure count, e.g. `[{ atFailures: 10, cooloffMs: 3_600_000 }]` |
| `parameters` | dimension combinations to evaluate; a lock trips if **any** trips |
| `whitelist?` | `(id) => boolean` — identities that are never counted or locked |
| `resetOnSuccess?` | clear failures on success (default `true`) |
| `failMode?` | `'open'` (default: allow + log on store error) or `'closed'` (deny) |

## Design principles

- **The core is the cross-framework story.** It stays zero-dependency and
  framework-neutral on purpose — no bespoke inversify/tsyringe adapter packages.
- **Correctness is the product.** This is security-critical code: the store's
  increment is atomic across instances, every configured parameter key is
  checked, and every change ships with a security pass.
- **fail-open by default.** If the store errors, the engine allows the attempt
  and logs — a database blip must not lock every user out. `failMode: 'closed'`
  is available for high-security deployments. Both paths are tested.
- **Identity extraction is the application's trust decision.** The engine never
  reads `X-Forwarded-For` or any proxy header for you.
- **Not a rate limiter.** For request-rate throttling use
  [`@nestjs/throttler`](https://www.npmjs.com/package/@nestjs/throttler); this
  library is about *failed-authentication* lockout.

MIT licensed. Part of the [nest-native](https://github.com/nest-native) family.
Not affiliated with the NestJS core team or the django-axes project.
