# @authlock/core

<p align="center">A framework-agnostic, django-axes-style login-lockout engine — persistent failed-attempt tracking, failure limits, tiered cooloff, and a pluggable store. Zero runtime dependencies.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@authlock/core"><img src="https://img.shields.io/npm/v/@authlock/core.svg" alt="NPM Version" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="Package License" /></a>
  <img src="https://img.shields.io/badge/coverage-100%25-brightgreen.svg" alt="Test Coverage" />
</p>

> [!WARNING]
> **Pre-release scaffold (`0.0.0`).** The repository foundation — build, test,
> coverage, complexity, release, and security gates — is in place, but the
> engine itself is not implemented yet. The public API below is the planned
> contract; follow the milestones in the repo's working plan.

## What it is

`@authlock/core` tracks failed login attempts in a store you already run and
locks an identity out once it trips a failure limit — the classic
[django-axes](https://django-axes.readthedocs.io/) behaviour, ported to
TypeScript and framework-agnostic:

- **Configurable identity dimensions** — key lockout on username, IP, a
  combination, or `+user_agent`. A lock trips if **any** configured parameter
  key exceeds the limit within the cooloff window.
- **Failure limit → lockout, with cooloff** — including **tiered cooloff**
  (each subsequent lockout waits longer), reset-on-success, a whitelist
  predicate, and a `Retry-After` hint.
- **Pluggable `LockoutStore`** — an in-memory store (single-instance) ships in
  the box; a Drizzle-backed store (the batteries-included default, with an
  atomic cross-instance increment) ships from the `./drizzle` subpath.
- **Zero runtime dependencies** — no framework, no DI, no decorators. Use it
  from Express, inversify, tsyringe, a bare script, or via the thin
  [`@nest-native/lockout`](https://www.npmjs.com/package/@nest-native/lockout)
  NestJS adapter.

## Entry points (planned)

| Import | Contents |
| --- | --- |
| `@authlock/core` | core engine — `LockoutManager`, `LockoutPolicy`, `LockoutStore` seam, `InMemoryLockoutStore` |
| `@authlock/core/drizzle` | the batteries-included Drizzle store (atomic increment) + table definition |
| `@authlock/core/sqlite` | better-sqlite3 dialect binding for the Drizzle store |
| `@authlock/core/postgres` | node-postgres dialect binding |
| `@authlock/core/mysql` | mysql2 dialect binding |
| `@authlock/core/testing` | hermetic helpers for testing lockout flows |

Only `.` exists today; the subpaths are added as the engine and stores land.

## Design principles

- **The core is the cross-framework story.** It stays zero-dependency and
  framework-neutral on purpose — no bespoke inversify/tsyringe adapter packages.
- **Correctness is the product.** This is security-critical code: the store's
  increment is atomic across instances, every configured parameter key is
  checked, and every change ships with a security pass.
- **fail-open by default.** If the store errors, the engine allows the attempt
  and logs — a database blip must not lock every user out. `failMode: 'closed'`
  is available for high-security deployments. Both paths are tested.
- **Not a rate limiter.** For request-rate throttling use
  [`@nestjs/throttler`](https://www.npmjs.com/package/@nestjs/throttler); this
  library is about *failed-authentication* lockout.

MIT licensed. Part of the [nest-native](https://github.com/nest-native) family.
Not affiliated with the NestJS core team or the django-axes project.
