# Changelog

All notable user-facing changes to `@authlock/core` and `@nest-native/lockout`
are tracked here.

This project follows semantic versioning for the published packages. Sample,
documentation, and CI-only changes may remain unreleased until the next package
release is useful for users.

## 0.2.0

Completeness + safety follow-up after a design review of 0.1.0.

### `@authlock/core`

- **Added `LockoutManager.reset(identifiers)`** — administratively unlock an
  identity by clearing its counters unconditionally (ignores `resetOnSuccess`
  and the whitelist). `recordSuccess` remains the "a login succeeded" call; this
  is the "an admin unlocked this user" call, which the API previously lacked.
- **Config validation** — the constructor now throws when `limit < 1` or
  `cooloffMs <= 0`, instead of silently accepting a configuration that would
  disable the lockout entirely. A security control that quietly does nothing is
  worse than a startup error.
- Docs: a prominent warning that locking by `['username']` alone is a
  denial-of-service vector (an attacker can lock a victim out by name) with
  mitigations, and how to unlock an identity.

### `@nest-native/lockout`

- **Added `LockoutService.reset(identifiers)`** — the adapter pass-through for
  the administrative unlock above.
- Docs: fixed the API reference (the adapter exports `VERSION`, not the
  previously-documented `CORE_VERSION`); documented `reset`.

## 0.1.0

The first published release (both packages).

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
