---
sidebar_position: 3
title: API Reference
---

# API Reference

:::warning Pre-release scaffold
This is the **planned** surface. Types and signatures may change until the
engine lands.
:::

## `@authlock/core` (core)

| Export | Kind | Purpose |
| --- | --- | --- |
| `LockoutManager` | class | `check()` / `recordFailure()` / `recordSuccess()`, multi-key evaluation, `onLockout` hook |
| `LockoutPolicy` | type | failure limit, cooloff (incl. tiered), whitelist predicate, `Retry-After` |
| `LockoutStore` | interface | `increment` / `get` / `clear` / `clearExpired` — the persistence seam |
| `InMemoryLockoutStore` | class | single-instance store, ships in the box |
| `Identifiers` | type | the identity dimensions (username, ip, user_agent, …) |
| `LockoutParameter` | type | one configured key combination that can trip a lock |
| `FailureRecord` | type | a stored failure count + window |
| `VERSION` | const | the package version |

The batteries-included Drizzle store ships from `@authlock/core/drizzle` (with
`@authlock/core/sqlite`, `@authlock/core/postgres`, `@authlock/core/mysql`
bindings), and hermetic test helpers from `@authlock/core/testing`.

## `@nest-native/lockout` (NestJS adapter)

| Export | Kind | Purpose |
| --- | --- | --- |
| `LockoutModule` | dynamic module | `forRoot()` / `forRootAsync()` |
| `LockoutGuard` | `CanActivate` | reject-if-locked, applied pre-authentication (429 + `Retry-After`) |
| `LockoutService` | provider | `reportFailure()` / `reportSuccess()` you call from your login handler |
| `VERSION` / `CORE_VERSION` | const | adapter + linked core versions |

The adapter builds only on stable Nest primitives (`CanActivate`,
`DynamicModule`, `HttpException`) and supports NestJS **10, 11, and 12**.
