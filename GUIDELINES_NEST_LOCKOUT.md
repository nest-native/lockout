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
- Support line: Node `>=22` (`>=22.12` on the NestJS 12 end — see the Node
  floor rule in §3); the adapter targets NestJS `^10.0.0 || ^11.0.0 || ^12.0.0`;
  the Drizzle store targets Drizzle `0.44` / `0.45`.
- **Peer majors are widened, never swapped.** When a peer ships a new major,
  the published `peerDependencies` range widens to include it, the
  devDependency (and therefore the lockfile every default CI job installs)
  stays on the older major so the default suite keeps testing that end, and a
  dedicated CI leg installs the newer major with `--no-save` and runs the
  suites and the samples. Both ends of the range are then tested claims. A
  Dependabot PR that moves the devDependency to the new major is not how a
  major gets adopted — see the version-compatibility rule in §3.

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
  NestJS 10, 11, and 12. The `nestjs-compat` CI matrix is what makes that a
  tested claim at every end of the range: one entry per end installs it on
  top of the 11.x lockfile (`npm install --no-save --workspaces
  --include-workspace-root` — the adapter workspace and the NestJS sample
  declare `@nestjs/*` at `^11` themselves, so a root-only install would leave
  each of them a nested 11), proves the tree, then runs the adapter
  typecheck, both suites, and the sample matrix. The `10 floor` entry pins
  `10.3.2`, the `11 floor` entry `11.0.0`, exactly, with the reasons next to
  the pins; the `12` entry floats on `^12.0.0`. A floor is an install-graph
  fact, not a source fact: nothing the adapter uses was added by a later
  10.x or 11.x, but `@nestjs/common` 10.0.0–10.3.1 peer on `reflect-metadata
  ^0.1.12` and this repo pins `^0.2.2`, so 10.3.2 — the first 10.x whose peer
  admits 0.2 — is the oldest 10 that installs here at all. Such floors are
  not peer-range corrections (a consumer on reflect-metadata 0.2 cannot
  reach 10.0–10.3.1 either), and the published range changes only if a
  suite actually fails at a floor. The matrix replaced two earlier lanes: a
  typecheck-only 10/11 matrix whose `^10` floated to 10.4.x and whose `11`
  entry was the lockfile again, and the blocking 12 leg that had replaced
  the informational 12-alpha canary once 12 went stable (2026-08-27). Before
  a leg tests anything, `scripts/check-nestjs-resolution.mjs <spec>` proves
  the tree is the one it claims: it requires the *exact* pinned version from
  inside every workspace (a downgrade that silently no-ops leaves the
  lockfile's 11.x in place, and "still 11" passes a major check), fails on
  nested copies, and checks every peer range in the NestJS ecosystem — every
  installed package at any depth that is `@nestjs/*` or peers on one, the
  adapter's own published range included — against the tree the suite will
  run on. The same script runs with no argument in `release:check`, against
  the lockfile. It is the gate because npm gives you nothing better: a peer
  conflict npm can override is `npm warn ERESOLVE overriding peer dependency`
  plus exit 0, which neither `npm ls` nor `--strict-peer-deps` reports
  afterwards — and grepping the install log for that warning is not a gate
  either, because npm also prints it for transitional states that end
  coherent. Never hide a conflict with `--legacy-peer-deps` — a leg that
  needs it is reporting an unsupported combination, not a flaky install (the
  old 10/11 lane in a sibling repo did exactly that, and tested nothing). The
  `@nestjs/*` devDependencies stay on
  11.x deliberately (§1), and Dependabot cannot deliver a NestJS major: the
  `@nestjs/*` packages peer on each other, so one-package-per-PR bumps fail
  `npm ci` with ERESOLVE before a single test runs (NestJS 12 opened fifteen
  such PRs across the org). The peer group in `.github/dependabot.yml`
  therefore groups majors too, so the next major arrives as one PR whose
  result carries information — input to the peer-widening recipe, not a
  replacement for it.
- **NestJS 12 is ESM-only: never import a directory index from `@nestjs/*`.**
  `@nestjs/common` and `@nestjs/core` 12 ship an exports map of
  `{".", "./internal", "./*.js", "./*": "./*.js"}`. A deep import that names a
  *file* (`@nestjs/core/injector/constants`) still resolves under it; one that
  names a *directory* (`@nestjs/common/interfaces`) does not, because there is
  no `<dir>.js` and ESM never completes a directory to its `index`. That one
  import was the whole NestJS 12 failure in `@nest-native/kafka` and
  `@nest-native/trpc`. This adapter has **no** deep imports at all — every
  import comes from the `@nestjs/common` / `@nestjs/core` roots — and that is
  the intended state: the stable-primitives rule above already forbids
  reaching into internals. If a deep import ever becomes unavoidable it must
  name a file, and the `nestjs-compat` matrix's `12` leg is the enforcement
  here: a directory import fails its typecheck and suites on 12, which the
  11.x install would never notice. Do not reach for
  `@nestjs/common/interfaces/controllers/controller.interface` as a workaround
  — still an internal path, and 12 defines that type as plain `object` anyway.
- **The Node floor stays `>=22`; NestJS 12 needs `>=22.12` of it.** The adapter
  compiles to CommonJS, so it loads the ESM-only NestJS 12 through Node's
  `require(esm)`, which is behind a flag before Node 22.12.0 (and 20.19.0 on
  the 20 line, below this repo's floor). `engines.node` stays `>=22` because
  it describes the whole peer range — the 10 and 11 ends run on any Node 22 —
  but Node 22.0–22.11 satisfies it and still cannot load NestJS 12, so every
  place that states the floor (the support line in §1, the README and
  support-policy compatibility tables, the adapter README, the changelog)
  carries the `>=22.12` qualifier for 12 rather than leaving `>=22` to imply
  it. Raising `engines` to `>=22.12` would be a floor change for NestJS 10
  and 11 users and is a separate decision, not part of widening the peer
  range.
- **The default major flips on a trigger, not per PR.** The devDependencies
  and the lockfile move from 11 to 12 when either NestJS 12 exceeds 50% of
  `@nestjs/core`'s weekly downloads or NestJS 11 stops receiving patches,
  whichever comes first. Read the split from
  `https://api.npmjs.org/versions/@nestjs%2Fcore/last-week` (on 2026-09-12:
  11 at 71%, 10 at 19%, 12 at 5%). NestJS has no LTS; the previous major has
  received patches for roughly a year after the next one shipped. Flipping
  means the `12` matrix entry becomes the default install, the `10 floor` and
  `11 floor` entries stay, and the standing grouped dependabot PR for the peer
  set is merged. Until then that PR stays open as the signal that the upgrade
  is one merge away — a green run is not a reason to merge it.
- **Dual CommonJS/ESM publishing is a dated non-goal; revisit in 2027.**
  Every community NestJS library that supports 12 today (nestjs-cls,
  nestjs-pino, the OpenTelemetry and throttler packages) publishes CommonJS
  and loads 12 through `require(esm)` exactly as this adapter does, and no
  consumer has asked for ESM output. An ESM or dual build is a breaking
  change with a real cost and no demonstrated benefit, so do not start one
  "while at it". Revisit when a consumer cannot load the package, or when
  those community libraries move.
- **Lifecycle-hook order across providers is not a contract.** NestJS 12
  reordered lifecycle hooks (`onModuleInit`, `onApplicationBootstrap`,
  `onModuleDestroy`, `beforeApplicationShutdown`, `onApplicationShutdown`) by
  the component's level in the module hierarchy, so the order in which two
  providers see the *same* hook differs between 11 and 12; the phase order is
  unchanged. This adapter implements no lifecycle hook today (the guard and
  the service are stateless over the injected `LockoutManager`). Should one
  land, it may rely on the phase order only — never on where another
  provider's same-phase hook falls — and no test may assert a within-phase
  order.
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
  locked identity slipping through — including via **un-normalized identity
  dimensions**, where case/whitespace variants split the counter), lockout
  **amplification / DoS** (an attacker locking a victim out by spoofing the
  victim's username or IP), fail-mode correctness, and the cross-instance
  counting guarantee.
- **Audit logging is the app's job, built from the exposed hooks** — never log
  the credential, only the identity dimensions used for the lock decision.
- **Audit scope.** The `security:audit` release gate audits the *published*
  surface — `audit-production-surface.mjs` packs the core tarball and audits its
  production closure. Since the core publishes `"dependencies": {}`, that is
  exactly what consumers install. Advisories confined to dev/peer/build tooling
  or the docs `website/` are tracked by Dependabot but do not block releases.
- **The docs audit reports, it does not gate.** `security:audit` hard-fails only
  on the *published* surface; `security:audit:docs` still runs and prints, but
  cannot fail the build. This makes the gate match the rule above — website
  advisories cannot reach consumers, so they must not block every PR in the
  repo. Precedent: `@nest-native/cache` and `@nest-native/trpc` were already
  package-only. Trigger: `image-size` (GHSA-w3rx-r6r6-pgpr,
  GHSA-5p2g-fcmc-qvqq) has NO patched version — 2.0.2 is both the latest
  release and vulnerable — and arrives through `@docusaurus/mdx-loader`, so the
  gate was unfixable by any dependency change. Dependabot still tracks the
  website tree; fix docs advisories when a fix exists.

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
  `@nest-native/lockout` (adapter, which depends on the core). When bumping
  either version, bump the adapter's `@authlock/core` dependency and **every**
  `sample/*/package.json` pin of **both** packages to the exact version, run
  `npm install` (so the lockfile stops resolving a sample to the previously
  *published* tarball), and `npm run release:check`.
- **A version-sync check iterates every package — it never hardcodes one
  name.** `check-sample-version-sync.mjs` derives its name → version map from
  every non-private `packages/*/package.json` and asserts the declared
  dependency, the `package-lock.json` entry, and the `npm ls` resolution for
  each of those packages a sample declares. The earlier single-package form
  (hardcoded `@authlock/core`, reading only `packages/core/package.json`) let
  `sample/02-nestjs-lockout` sit on the published `@nest-native/lockout@0.3.1`
  — dragging a nested `@authlock/core@0.3.0` into the sample tree, so the
  NestJS dogfood exercised the *previous release* instead of the workspace
  sources — while the gate stayed green. Any future sync check follows the same
  rule: enumerate the packages, never name one.
- **Version literals are release-blocking.** A version string in a README
  `Status` line, a badge, `CONTRIBUTING`, or a compatibility table ships to
  users, so a stale one is a release defect; where such a literal exists it is
  enforced by `release:check:readme-version`, which asserts it against
  `packages/<pkg>/package.json`. Prefer **dynamic** badges
  (`img.shields.io/npm/v/<pkg>`) to hardcoded `img.shields.io/badge/version-…`
  or `badge/status-…` ones. This repo carries **no** package-version literal
  — both package READMEs use the dynamic npm badge — so no readme-version
  check is wired here; introduce one and you must add the check in the same
  change. The compatibility tables (root README, support policy), the adapter
  README, and the support line in §1 do state the Node floor and the peer
  ranges as literals, and `release:check:compat-tables`
  (`scripts/check-compat-tables.mjs`) pins every one of them to `engines.node`
  and the `@nestjs/*` / `drizzle-orm` peer ranges in the manifests, so a floor
  or range change that misses a page fails `release:check`.
- Publish via a `vX.Y.Z` tag → `release.yml`, using npm **Trusted Publishing
  (OIDC)** — NO long-lived `NPM_TOKEN`. The workflow's `id-token: write`
  permission lets the npm CLI mint a short-lived, workflow-scoped credential and
  attach provenance automatically; this sidesteps npm's restriction on tokens
  that bypass 2FA (account changes Aug 2026, direct publishing Jan 2027). Each
  package needs a **Trusted Publisher** configured on npmjs.com (repo
  `nest-native/lockout`, workflow `release.yml`) before its first OIDC release;
  a brand-new package may need one manual 2FA publish (or a pre-registered
  trusted publisher) to bootstrap. The workflow publishes the core first, then
  the adapter. If independent per-package cadence is adopted later, split into
  tag-prefixed workflows.
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
