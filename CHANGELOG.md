# Changelog

All notable user-facing changes to `@authlock/core` and `@nest-native/lockout`
are tracked here.

This project follows semantic versioning for the published packages. Sample,
documentation, and CI-only changes may remain unreleased until the next package
release is useful for users.

## Unreleased

The first published release will be `0.1.0` (both packages). Everything below is
implemented and tested but not yet on npm.

### `@authlock/core`

- **The lockout engine.** `LockoutManager` with `check` (read-only pre-auth
  gate), `recordFailure`, `recordSuccess`, and `pruneExpired`. Failure limit →
  lockout, base + **tiered cooloff** (escalating by failure count), a
  failure-counting window, reset-on-success, a whitelist predicate, a
  `Retry-After` hint, and an `onLockout` transition hook. Multi-key evaluation:
  a lock trips if **any** configured parameter (e.g. `['username']`, `['ip']`)
  reaches the limit; the decision reports the most restrictive retry-after.
- **fail-open by default**, `failMode: 'closed'` to deny on store error. Keys
  are derived by hashing identity dimensions with `node:crypto`, so raw
  credentials never reach a store.
- **Stores.** `InMemoryLockoutStore` (single-instance) plus Drizzle stores at
  `@authlock/core/{drizzle,postgres,sqlite,mysql}` — each an atomic
  create-or-increment-with-window-reset in a single statement, so concurrent
  attempts across instances count exactly once. `drizzle-orm` stays an OPTIONAL
  peer; the root entry is zero-dependency.
- 100% coverage; verified against real Postgres + MySQL (incl. a concurrency /
  no-lost-updates test) as well as in-process pglite/better-sqlite3.

### `@nest-native/lockout`

- **The NestJS adapter.** `LockoutModule.forRoot` / `forRootAsync`,
  `LockoutGuard` (reject-if-locked → HTTP 429 + `Retry-After`, applied
  pre-authentication; Express and Fastify responses), and `LockoutService`
  (`check` / `reportFailure` / `reportSuccess`) — the explicit call site an app
  uses, since NestJS has no ambient auth-failure signal. Default identity
  extractor (body username, `req.ip`, user-agent; no `X-Forwarded-For` trust)
  with an override hook, and `failMode` wiring. Builds on stable Nest primitives
  so the same code runs on NestJS 10, 11, and 12.

### Samples & docs

- A framework-free `@authlock/core` showcase, a bare-**Express** neutrality app,
  and a **NestJS** reference app — all three drive the full lockout flow (two
  over real HTTP) and run in CI. READMEs document quick-start usage, the Drizzle
  store story, and a Passport recipe.
