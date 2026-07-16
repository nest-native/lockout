---
sidebar_position: 4
title: Testing
---

# Testing

:::warning Pre-release scaffold
Testing helpers (`@authlock/core/testing`) arrive with the engine.
:::

The core is designed to be tested hermetically:

- **In-memory store** — `InMemoryLockoutStore` needs no database, so the
  failure-count, cooloff, tiered-cooloff, whitelist, and reset-on-success logic
  is testable in-process.
- **Both failure modes** — `failMode: 'open'` (allow + log on store error) and
  `failMode: 'closed'` (deny on store error) are both covered.
- **Atomic increment** — the Drizzle store's cross-instance increment is
  verified with a concurrency test (many simultaneous failures must count
  exactly once each).
- **Neutrality acceptance test** — a bare-Express example proves the core works
  with zero framework coupling.

The core package is held to **100% coverage** (branches, functions, lines,
statements) and a SonarJS cognitive-complexity ceiling of 15. Gated
Drizzle-store round-trips run against real Postgres and MySQL when
`LOCKOUT_POSTGRES_URL` / `LOCKOUT_MYSQL_URL` are set (see the repo's local
full-mode verification).
