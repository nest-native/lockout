---
sidebar_position: 3
title: API Reference
---

# API Reference

## `@authlock/core`

### The engine

| Export | Kind | Purpose |
| --- | --- | --- |
| `LockoutManager` | class | `check()` (read-only pre-auth gate), `recordFailure()`, `recordSuccess()`, `pruneExpired()`; multi-key evaluation + `onLockout` hook |
| `InMemoryLockoutStore` | class | single-instance store, ships in the box |
| `deriveKeys` | function | resolve an identity to its storage keys (sha256 of the dimension/value pairs — raw values never reach a store) |
| `cooloffFor` / `effectiveWindowMs` / `evaluateRecord` | functions | the pure policy maths, exported for custom stores and tooling |
| `VERSION` | const | the package version |

### Types

| Type | Purpose |
| --- | --- |
| `Identifiers` | the identity dimensions (`username`, `ip`, `userAgent`, custom…) |
| `LockoutParameter` | one dimension combination that can trip a lock, e.g. `['ip', 'userAgent']` |
| `FailureRecord` | a stored counter: `{key, failures, firstFailureAt}` — lock state is *derived*, never stored |
| `CooloffTier` | `{atFailures, cooloffMs}` — escalating cooloff by failure count |
| `FailMode` | `'open'` (allow + log on store error, default) or `'closed'` (deny) |
| `LockoutPolicy` | limit, cooloff, window, tiers, parameters, whitelist, resetOnSuccess, failMode |
| `LockoutDecision` | `{locked, retryAfterMs, trippedParameter}` |
| `LockoutManagerOptions` | the policy plus `store`, `onLockout`, `logger`, and an injectable `now` clock |
| `LockoutStore` | the persistence seam: `increment` / `get` / `clear` / `clearExpired` (each sync or async) |

### Policy options

| Option | Meaning |
| --- | --- |
| `limit` | failures allowed before a key locks (locks at exactly `limit`) |
| `cooloffMs` | base lock duration once locked |
| `windowMs?` | failure-counting window; defaults to the effective cooloff |
| `tiers?` | escalating cooloff by failure count, e.g. `[{atFailures: 10, cooloffMs: 3_600_000}]` |
| `parameters` | dimension combinations to evaluate; a lock trips if **any** trips |
| `whitelist?` | `(id) => boolean \| Promise<boolean>` — identities never counted or locked |
| `resetOnSuccess?` | clear failures on success (default `true`) |
| `failMode?` | `'open'` (default) or `'closed'` |

### Store subpaths

| Import | Contents |
| --- | --- |
| `@authlock/core/drizzle` | all three stores + table factories (needs `drizzle-orm`, no driver) |
| `@authlock/core/postgres` | `PostgresLockoutStore` + `pgLockoutTable()` |
| `@authlock/core/sqlite` | `SqliteLockoutStore` + `sqliteLockoutTable()` |
| `@authlock/core/mysql` | `MysqlLockoutStore` + `mysqlLockoutTable()` |

Every dialect uses the same table shape — `key` (primary key), `failures`, and
`first_failure_at` (a numeric epoch in ms) — and the same semantics: the
increment is a **single atomic** create-or-increment-with-window-reset
statement, so concurrent attempts across app instances count exactly once each.
Postgres and SQLite read the result back with `RETURNING`; MySQL (which has no
`RETURNING`) re-selects the row, which can only ever report an equal-or-higher
count — never an undercount an attacker could slip through.

`drizzle-orm` is an **optional peer**: the root `@authlock/core` import pulls
no Drizzle at all and stays zero-dependency.

## `@nest-native/lockout`

| Export | Kind | Purpose |
| --- | --- | --- |
| `LockoutModule` | dynamic module | `forRoot(options)` / `forRootAsync({useFactory, inject, imports})`; global by default |
| `LockoutGuard` | `CanActivate` | reject-if-locked, applied **before** authentication — HTTP 429 + `Retry-After` (Express and Fastify responses) |
| `LockoutService` | provider | `check()` / `reportFailure()` / `reportSuccess()` — the explicit call site for your login handler |
| `defaultExtractor` | function | `username` from the body, `ip` from `req.ip`, `userAgent` from the header — deliberately no `X-Forwarded-For` trust |
| `LOCKOUT_MANAGER` / `LOCKOUT_OPTIONS` | tokens | `Symbol.for` DI tokens (the manager is injectable directly) |
| `LockoutModuleOptions` | type | everything `LockoutManagerOptions` takes, plus `extractor` and `isGlobal` |
| `IdentifierExtractor` | type | `(context: ExecutionContext) => Identifiers` |
| `VERSION` / `CORE_VERSION` | const | adapter + linked core versions |

The adapter builds only on stable Nest primitives (`CanActivate`,
`DynamicModule`, `HttpException`, `ExecutionContext`) and supports NestJS
**10, 11, and 12**.

:::tip Identity extraction is your trust decision
The default extractor reads `req.ip` — the connection address. Behind a proxy,
configure your platform's `trust proxy` (or supply your own `extractor`) so the
IP dimension reflects a source you actually trust; the library never reads
proxy headers for you.
:::
