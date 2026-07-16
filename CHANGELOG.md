# Changelog

All notable user-facing changes to `@authlock/core` and `@nest-native/lockout`
are tracked here.

This project follows semantic versioning for the published packages. Sample,
documentation, and CI-only changes may remain unreleased until the next package
release is useful for users.

## Unreleased

- **Repository scaffold.** Bootstrapped the two-package monorepo:
  `@authlock/core` (the framework-agnostic, zero-runtime-dependency core, with an
  explicit empty `"dependencies": {}` and `drizzle-orm` as an OPTIONAL peer for
  the future `./drizzle` store) and `@nest-native/lockout` (a thin NestJS DI
  adapter that supports NestJS 10, 11, and 12). Neither the engine nor the
  adapter is implemented yet — this commit is the foundation only: build,
  typecheck, 100%-coverage gate on the core, cognitive-complexity gate, release
  checks (README links, sample version sync, tarball pack, packed-consumer
  smoke), the production supply-chain audit, the Docusaurus site, and the
  local-only full-mode infra (`compose.yaml` with Postgres + MySQL) and Stryker
  mutation config. See `GUIDELINES_NEST_LOCKOUT.md` and the working plan.
