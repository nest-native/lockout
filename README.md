# authlock

<p align="center">A django-axes-style <strong>login-lockout</strong> engine for TypeScript — persistent failed-attempt tracking, failure limits, tiered cooloff, and a pluggable store. A framework-agnostic core plus a thin NestJS adapter.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@authlock/core"><img src="https://img.shields.io/npm/v/@authlock/core.svg" alt="NPM Version" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/coverage-100%25-brightgreen.svg" alt="Core Coverage" />
  <a href="https://nest-native.dev/lockout/"><img src="https://img.shields.io/badge/docs-authlock-0f766e.svg" alt="Documentation" /></a>
</p>

**authlock** — a django-axes-style login-lockout engine for Node: a
framework-agnostic core ([`@authlock/core`](packages/core)) with a first-class
NestJS integration ([`@nest-native/lockout`](packages/nestjs)).

> [!NOTE]
> **Published and following semver** — [`@authlock/core`](https://www.npmjs.com/package/@authlock/core)
> and [`@nest-native/lockout`](https://www.npmjs.com/package/@nest-native/lockout)
> are on npm (OIDC trusted publishing with provenance). Version history is in
> the [changelog](CHANGELOG.md); full documentation lives at
> [nest-native.dev/lockout](https://nest-native.dev/lockout/).

## The problem it solves

Every app with a login form needs brute-force protection: after N failed
attempts for a username or IP, stop accepting attempts for a while, then cool
off. Django solves this with [django-axes](https://django-axes.readthedocs.io/).
`@authlock/core` brings the same model to TypeScript — and, crucially, keeps the
engine **framework-agnostic** so it is not tied to any one web framework.

- **Configurable identity dimensions** — lock on username, IP, a combination,
  or `+user_agent`. A lock trips if **any** configured parameter key exceeds
  the limit within the cooloff window.
- **Failure limit → lockout, with cooloff** — including **tiered** cooloff
  (each subsequent lockout waits longer), reset-on-success, a whitelist
  predicate, and a `Retry-After` value.
- **Pluggable store** — an in-memory store ships in the box; a Drizzle-backed
  store (the batteries-included default, with an **atomic** cross-instance
  increment) is the durable option.
- **fail-open by default** — if the store errors, the engine allows and logs, so
  a database blip never locks everyone out. `failMode: 'closed'` is available
  for high-security deployments.

## Two packages

| Package | What it is |
| --- | --- |
| [`@authlock/core`](packages/core) | the framework-agnostic, **zero-runtime-dependency** engine — usable from Express, inversify, tsyringe, or a bare script |
| [`@nest-native/lockout`](packages/nestjs) | a thin NestJS DI adapter — `LockoutGuard` + `LockoutService` + `LockoutModule` (NestJS 10 / 11 / 12) |

The neutral core **is** the cross-framework story — there are no bespoke
inversify/tsyringe adapter packages.

## Honest by design: NestJS has no login-failure signal

`django-axes` hooks Django's ambient `user_login_failed` signal, so it is
install-and-forget. **NestJS has no equivalent signal bus**, so
`@nest-native/lockout` cannot be. It offers explicit wiring instead: a
`LockoutGuard` (reject-if-locked, pre-auth), a `LockoutService`
(`reportFailure` / `reportSuccess` you call from your login handler), and a
documented Passport-strategy recipe. The docs lead with this honestly.

## Quality Gates

Every change runs the full gate — build, typecheck (both packages), coverage
with `c8` enforced at **100%** on the core (statements, branches, functions,
lines), cognitive-complexity enforcement (SonarJS threshold `15`) on the core,
tarball validation, sample version sync, a supply-chain audit of the published
surface, the docs build, and the samples:

```bash
npm run ci
```

The **core** (`@authlock/core`) is held to the strict non-negotiables (100%
coverage, complexity ≤ 15, zero published runtime deps). The **adapter**
(`@nest-native/lockout`) is a thin DI shell tested pragmatically (its own
`test:nestjs` lane), not to 100%.

Two **optional, local-only** layers sit on top (forks work without Docker):

- **Full mode** — `npm run infra:up && npm run test:full` runs the gated
  Drizzle-store round-trips against disposable Postgres + MySQL containers
  (`compose.yaml`); `npm run infra:down` cleans up.
- **Mutation testing** — `npm run test:mutation` (incremental Stryker run).
  Scope with `STRYKER_MUTATE`; never runs in CI.

Details, including the pre-PR ritual and agent instructions, are in
[GUIDELINES_NEST_LOCKOUT.md](GUIDELINES_NEST_LOCKOUT.md#local-full-mode-verification-optional-infra--mutation-testing).

## Non-goals (v1)

- **Admin UI / dashboard**, template/URL lockout rendering.
- **Deep `X-Forwarded-For` proxy matrix** — the library exposes an identity
  extractor hook and does not trust proxy headers by default.
- **Bespoke inversify/tsyringe adapter packages** — the neutral core is the
  cross-framework story.
- **Rate limiting** — a distinct concern; use
  [`@nestjs/throttler`](https://www.npmjs.com/package/@nestjs/throttler). This
  library is about *failed-authentication* lockout.

See the [00-showcase sample](sample/00-showcase) and the
[documentation](https://nest-native.dev/lockout/).

Part of the [nest-native](https://github.com/nest-native) family. Not affiliated
with the NestJS core team or the django-axes project. MIT licensed.
