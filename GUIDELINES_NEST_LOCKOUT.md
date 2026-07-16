# GUIDELINES_NEST_LOCKOUT.md
## Core Philosophy — a django-axes-style login lockout engine, framework-first-neutral

`@authlock/core` implements **persistent failed-login lockout** — the
[django-axes](https://django-axes.readthedocs.io/) model, in TypeScript, and
nothing more. It tracks failed authentication attempts keyed by configurable
identity dimensions, locks an identity out once it trips a failure limit, cools
off (with an optional tiered schedule), resets on success, honours a whitelist
predicate, and reports a `Retry-After`. It is **not** a rate limiter (that is
`@nestjs/throttler`), **not** an auth framework, and **not** a session manager.

The engine is **framework-agnostic and zero-dependency on purpose**. The
`@nest-native/lockout` package is a thin DI adapter over it — deliberately thin,
because the neutral core is the whole cross-framework story.

### 1. Architecture assumptions (never break these)

- **Framework-agnostic, zero-runtime-dependency core.** `@authlock/core`
  contains no NestJS, no DI container, no decorators, and no Drizzle in its
  default surface. It must be usable from Express, inversify, tsyringe, Fastify,
  or a bare script. This is a hard constraint: the published
  `packages/core/package.json` keeps an explicit empty
  `"dependencies": {}`. `drizzle-orm` is an **optional peer** used ONLY by the
  `./drizzle` store subpath.
- **Storage is a pluggable `LockoutStore` seam.** The engine never binds to a
  database. Drizzle is **one** store — the batteries-included default — sitting
  alongside an in-memory store; users may provide their own. This mirrors
  django-axes's pluggable handler design and the `@nest-native/messaging` /
  `@nest-native/jobs` dialect-agnostic-core-plus-pluggable-store shape. The
  store owns persistence (`increment` / `get` / `clear` / `clearExpired`); the
  engine only calls it and applies policy.
- **Correctness is the product — this is a security control.** Two invariants
  are non-negotiable:
  - **Atomic increment across instances.** The Drizzle store increments a
    failure counter in a single atomic upsert/increment operation, so
    concurrent failed attempts from many app instances count exactly once each
    and can never overshoot the limit unnoticed. The in-memory store is
    single-instance by definition — that limitation is **documented on its
    surface**, not hidden.
  - **Any configured key trips the lock.** If several parameters are configured
    (e.g. `[['username'], ['ip'], ['ip', 'user_agent']]`), the identity is
    locked when **any** of those keys exceeds the limit within the cooloff
    window.
- **fail-open by default.** If the store errors, the engine **allows** the
  attempt and logs the error — a database blip must never lock every user out.
  `failMode: 'closed'` (deny on store error) is available for high-security
  deployments. Both paths are explicitly tested.
- **The NestJS adapter cannot be install-and-forget.** NestJS has no ambient
  authentication-failure signal (Django's `user_login_failed`), so the adapter
  offers **explicit wiring**, not magic: a `LockoutGuard` (reject-if-locked,
  applied pre-authentication), a `LockoutService` (`reportFailure` /
  `reportSuccess` the application calls from its own login handler), and a
  documented Passport-strategy recipe. The docs must lead with this honestly.
- **Identity extraction is the application's trust decision.** The library
  exposes an extractor hook and does **not** trust `X-Forwarded-For` or any
  proxy header by default. A deep proxy matrix is out of scope (see non-goals).
- Support line: Node `>=20`; the adapter targets NestJS `10.x` / `11.x` /
  `12.x`; the Drizzle store targets Drizzle `0.44` / `0.45`.

### 2. Public API

**Core (`@authlock/core`):**
- `Identifiers` — the identity dimensions (`username`, `ip`, `user_agent`, …).
- `LockoutParameter` — one configured key combination that can trip a lock.
- `FailureRecord` — a stored failure count plus its window/timestamps.
- `LockoutStore` — `increment(key, …)` / `get(key)` / `clear(key)` /
  `clearExpired(now)`; the transactional persistence seam, dialect-opaque.
- `LockoutPolicy` — failure `limit`, `cooloffMs`, an optional **tiered** cooloff
  schedule, a `whitelist` predicate, and `Retry-After` derivation.
- `LockoutManager` — `check(identifiers)` (reject-if-locked, returns lock state
  + `retryAfterMs`), `recordFailure(identifiers)`, `recordSuccess(identifiers)`;
  multi-key evaluation and an `onLockout` hook.
- `InMemoryLockoutStore` — single-instance store, ships in the core.
- Subpaths: `.` (core), `./drizzle` (the store) with `./sqlite` / `./postgres` /
  `./mysql` dialect bindings, and `./testing` (hermetic helpers). Only `.` exists
  in the scaffold; the rest land with the engine.

**NestJS adapter (`@nest-native/lockout`):**
- `LockoutModule.forRoot({ store, limit, cooloffMs, parameters, failMode, … })`
  / `forRootAsync(...)`.
- `LockoutGuard` — a `CanActivate` that rejects a locked identity with HTTP 429
  and a `Retry-After` header, applied **before** the authentication guard.
- `LockoutService` — `reportFailure(...)` / `reportSuccess(...)` for the app's
  login handler; plus the Passport recipe in the docs.

### 3. Implementation rules

- The published `packages/core/package.json` keeps an explicit empty
  `"dependencies": {}`; `drizzle-orm` is an OPTIONAL peer (`./drizzle` only).
  The adapter depends on the core and declares `@nestjs/common` / `@nestjs/core`
  (plus `reflect-metadata` / `rxjs`) as peers.
- **Store rule:** the store performs the atomic increment and the read; the
  manager owns policy (limit comparison, cooloff/tier computation, whitelist,
  reset-on-success). Keep policy in one place so behaviour is identical across
  stores.
- **Version compatibility:** the adapter builds ONLY on stable Nest primitives
  (`CanActivate`, `DynamicModule`, `HttpException`) so the same code runs on
  NestJS 10, 11, and 12. A CI matrix typechecks the adapter against 10 and 11
  (backward-compat lane), and a **gated, informational** NestJS-12 pre-release
  canary job (`continue-on-error`) tracks the next major without blocking merges.
- Keep the lock decision a single code path: gather every configured key, ask
  the store for each count, and lock if any exceeds the limit within its window
  — one function, easy to reason about and to mutation-test.

### 4. Non-negotiable style

- 100% test coverage (branches/functions/lines/statements) on the **core**
  package (`packages/core`); SonarJS cognitive complexity ≤ 15 per
  function on the core.
- The **adapter** (`packages/nestjs`) is a thin DI shell and is **not** held to
  100% — it has its own `test:nestjs` lane and is tested pragmatically (like a
  reference app), not to the core's bar.
- Tests cover both failure modes (open/closed), tiered cooloff, the whitelist,
  reset-on-success, and the multi-key "any key trips the lock" rule
  hermetically (in-memory store), plus a **concurrency test** proving the
  atomic increment, plus a **bare-Express neutrality acceptance test** proving
  the core has zero framework coupling. Real Postgres + MySQL round-trips are
  gated behind `LOCKOUT_POSTGRES_URL` / `LOCKOUT_MYSQL_URL`.
- NestJS naming + DI conventions in the adapter; tokens via `Symbol.for`.

### 5. Security Review Requirements (MANDATORY)

- **Every PR includes an explicit security pass.** This is a security control;
  a regression is a vulnerability. Reason explicitly about lockout **bypass** (a
  locked identity slipping through), lockout **amplification / DoS** (an attacker
  locking a victim out by spoofing the victim's username or IP), fail-mode
  correctness, and the cross-instance counting guarantee.
- **Audit scope.** The `security:audit` release gate audits the *published*
  surface — `audit-production-surface.mjs` packs the core tarball and audits its
  production closure. Since the core publishes `"dependencies": {}`, that is
  exactly what consumers install. Advisories confined to dev/peer/build tooling
  or the docs `website/` are tracked by Dependabot but do not block releases.
- **Strictness scope.** The non-negotiables (100% coverage, complexity ≤ 15,
  zero published runtime deps, isolated major-version review) govern the *core*
  package (`packages/core`). Non-core code — the adapter's thin shell,
  `sample/*`, the `website/`, dev tooling — uses lighter rules: dependency
  updates there (including majors) may merge on green CI without the core's
  major-isolation ceremony.
- No secret leakage in code, tests, samples, logs, or docs. Never log the
  credential, only the identity dimensions needed for the lock decision.

### 6. Release version synchronization (MANDATORY)

- Two packages ship from this repo: `@authlock/core` (core) and
  `@nest-native/lockout` (adapter, which depends on the core). When bumping the
  core version, bump the adapter's `@authlock/core` dependency and every
  `sample/*/package.json` `@authlock/core` pin to the exact version, run
  `npm install`, and `npm run release:check`.
- Publish via a `vX.Y.Z` tag → `release.yml` (provenance + the `NPM_TOKEN`
  secret); the workflow publishes the core first, then the adapter. If
  independent per-package cadence is adopted later, split into tag-prefixed
  workflows.
- **Governance transition:** during the initial dogfood the repo is local-first
  (direct commits to `main`, no branch protection). After the first `v0.1.0`
  dogfood release, switch `main` to branch-protection + PR-only, matching the
  rest of the nest-native family.

## Local Full-Mode Verification (optional infra + mutation testing)

Everything in this section is **opt-in and local-only**. Plain `npm test` and
`test:cov` run without Docker and skip the gated store specs (CI covers them in
a dedicated job with its own Postgres + MySQL services); forks work out of the
box. **CI never runs mutation testing** — it is an on-demand, local-only gate.

### Gated I/O specs (real Postgres + MySQL)

- `npm run infra:up` — disposable containers from `compose.yaml` (Postgres on
  `127.0.0.1:54329`, MySQL on `127.0.0.1:33069` — non-default ports so this
  stack coexists with other nest-native repos). Needs Docker.
- `npm run test:full` — the hermetic suite plus the gated store round-trips
  against those containers (`LOCKOUT_POSTGRES_URL` / `LOCKOUT_MYSQL_URL` are set
  inline to the compose URLs).
- `npm run infra:down` — removes the containers and their volumes.
- Using your own databases instead: export `LOCKOUT_POSTGRES_URL` /
  `LOCKOUT_MYSQL_URL` and run `npm run test:integration` — the specs gate purely
  on the env vars.

**AI agents working on this repo**: when Docker is available, run
`npm run infra:up && npm run test:full` before opening a PR that touches package
source, and report the result (including the gated specs) in the PR body. When
Docker is not available, run `npm test` and state that the gated specs were
skipped. Never wire any of this into CI.

### Mutation testing (Stryker — occasional targeted audit, local only, never in CI)

Mutation testing here is an **occasional, targeted audit — not a per-PR gate**.
Run it deliberately when you have written or reworked non-trivial logic in a
file and want to know whether its tests actually pin the behaviour. Security
logic (the lock decision, the atomic increment, the cooloff/tier maths, the
fail-open vs fail-closed branch) is exactly where surviving mutants matter most.

**Run it scoped, never full-package.** The command runner re-runs the whole
suite per mutant, so a full run is slow to impractical. Scope to the one file
you changed and use hand-verification:

- `npm run test:mutation` — **incremental** run (cache:
  `reports/stryker-incremental.json`; only re-tests what changed).
- `npm run test:mutation:full` — every mutant from scratch (`--force`).
- `STRYKER_MUTATE='packages/core/store/**,packages/core/policy.ts'`
  — comma-separated globs to scope a run to the files a change touched.
- `STRYKER_WITH_INFRA=1` — each mutant also runs the gated store specs
  (`npm run test:mutant:full` per mutant, concurrency forced to 1 because the
  specs share one database; run `npm run infra:up` first). Slow by design; use
  it when a change touches store-adjacent code.
- Report: `reports/mutation/mutation.html`. Thresholds are advisory
  (`break: null`) — the signal is *which mutants survive*, not the score.

**Verify a kill without re-running Stryker — the fast path.** Hand-apply the
exact surviving mutation to the source, run the plain suite (or just the one
spec), confirm your new test fails, then `git checkout --` to revert. This
decouples the slow "find survivors" step from a fast "prove the kill" step.

**If a run times out, kill the leftovers first.** A killed Stryker command can
leave detached test processes that starve the next run — `pgrep -f stryker`,
`kill -9`, confirm RAM recovered, then retry.

Treat each survivor by the doctrine: add a test that kills it; simplify
redundant code whose mutant is behaviorally equivalent (with a CHANGELOG note);
mark a genuine equivalent with `// Stryker disable next-line <Mutator>:
<reason>`; or, for timing/randomness, assert bounds/progression rather than
exact values. Keep CI fast and mutation-free — that is a deliberate contract.
