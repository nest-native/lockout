# Changelog

All notable user-facing changes to `@authlock/core` and `@nest-native/lockout`
are tracked here.

This project follows semantic versioning for the published packages. Sample,
documentation, and CI-only changes may remain unreleased until the next package
release is useful for users.

## Unreleased

### `@authlock/core`

- **Added per-dimension identity `normalize`** — a `Record<dimension, (value) =>
  string>` on the policy, applied to each identity value before key derivation
  on every path (check / record / reset). Without it, `Alice`, `alice`, and
  `alice ` hash to three different counters, so a case-insensitive login could
  be brute-forced past the limit by varying case or whitespace — a bypass the
  docs previously only warned about. Normalizers are validated at construction
  (each entry must be a function). Fully backward compatible: omit `normalize`
  and behaviour is unchanged.

## 0.3.1

`@nest-native/lockout` only (`@authlock/core` unchanged at 0.3.0).

- **`LockoutModule.forRootAsync` `useFactory` is now typed `(...args: any[])`**,
  matching NestJS's own `FactoryProvider.useFactory`. Previously it was
  `(...args: unknown[])`, so a factory declared with a **typed** injected
  parameter — the common case, e.g. `(db: MyDatabase) => ({ store: ... })` fed by
  `inject` — did not assign under `strictFunctionTypes` and forced callers to
  widen to `unknown` and re-narrow. Surfaced while integrating the adapter into a
  real app. No runtime change.
- Docs: a note that on non-HTTP transports (tRPC, GraphQL, WebSocket) you use
  `LockoutService` in your handler rather than `LockoutGuard`, since the guard's
  default extractor assumes the credential is in the HTTP request body.

## 0.3.0

A security-hardening release from a design review + an adversarial audit against
the django-axes/DRF vulnerability history. **Includes one behavior change and a
store-schema change — see Migrating below.**

### `@authlock/core`

- **Fixed: escalating (tiered) cooloff leaked unthrottled guesses.** The cooloff
  now cools off from the MOST RECENT failure (`lastFailureAt`), not the window
  start, so every failed attempt re-locks the identity — closing a gap where, in
  a tiered config, an attacker got a burst of free guesses between the base lock
  and the next tier. The window (and the maximum lockout duration) is still
  measured from the first failure, so a sustained attacker cannot keep a victim
  locked out beyond `windowMs`.
- **Added `last_failure_at`** to `FailureRecord` and every Drizzle table.
- **Tier validation.** The constructor now rejects tier configs that would
  silently weaken the control: non-integer / non-positive / `NaN` `atFailures`,
  non-finite / non-positive `cooloffMs`, duplicate thresholds, and — importantly
  — a **non-monotonic** schedule (a higher failure count that would lock for
  *less* time, which an attacker could use to self-unlock early).
- **`onLockout` now fires on tier escalations**, not just the initial lock (once
  per escalation; best-effort under MySQL concurrency).
- Docs: a security section covering the `X-Forwarded-For` / proxy-trust spoofing
  class (bypass and victim-DoS), identity normalization, store-growth bounding
  via scheduled `pruneExpired` + upstream rate limiting, and the fail-open
  behavior during a store outage.

### Migrating from 0.2.x

The Drizzle stores gained a `last_failure_at` column. The lockout table is
ephemeral (transient counters), so the simplest migration is to **drop and
recreate it** from the updated `*LockoutTable()` factory. To migrate in place
instead: `ALTER TABLE lockout_attempts ADD COLUMN last_failure_at <bigint|integer> NOT NULL DEFAULT 0`
(the in-memory store needs nothing). The `LockoutManager` API is unchanged; if
you read `FailureRecord` directly, note the added `lastFailureAt` field.

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
