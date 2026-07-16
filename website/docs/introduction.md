---
sidebar_position: 1
title: Introduction
---

# authlock

A **django-axes-style** login-lockout engine for TypeScript: persistent
failed-attempt tracking, failure limits, tiered cooloff, reset-on-success, a
whitelist predicate, and a `Retry-After` hint — with a pluggable store.

:::warning Pre-release scaffold
The repository foundation (build, test, coverage, complexity, release, and
security gates) is in place, but the engine itself is not implemented yet. The
pages here describe the **planned** design. This is a community project in the
`nest-native` family and is **not** affiliated with the NestJS core team or the
django-axes project.
:::

## The problem it solves

Every app with a login form needs brute-force protection: after N failed
attempts for a username or IP, stop accepting attempts for a while. That is
exactly what [django-axes](https://django-axes.readthedocs.io/) does for
Django. `@authlock/core` brings the same model to TypeScript, and keeps the core
**framework-agnostic**.

- **Configurable identity dimensions** — lock on username, IP, a combination,
  or `+user_agent`. A lock trips if **any** configured parameter key exceeds
  the limit within the cooloff window.
- **Failure limit → lockout, with cooloff** — including tiered cooloff (each
  subsequent lockout waits longer), reset-on-success, a whitelist predicate,
  and a `Retry-After` value for your response.
- **Pluggable `LockoutStore`** — an in-memory store (single-instance) ships in
  the box; a Drizzle-backed store (the batteries-included default, with an
  atomic cross-instance increment) ships from the `@authlock/core/drizzle`
  subpath.
- **fail-open by default** — if the store errors, the engine allows the attempt
  and logs, so a database blip never locks everyone out. `failMode: 'closed'`
  is available for high-security deployments.

## Two packages

| Package | What it is |
| --- | --- |
| [`@authlock/core`](https://www.npmjs.com/package/@authlock/core) | the framework-agnostic, zero-dependency engine |
| [`@nest-native/lockout`](https://www.npmjs.com/package/@nest-native/lockout) | a thin NestJS DI adapter (guard + service + module) |

## Not a rate limiter

`@authlock/core` is about **failed-authentication** lockout, not request-rate
throttling. For rate limiting, use
[`@nestjs/throttler`](https://www.npmjs.com/package/@nestjs/throttler).

Continue with the [Quick Start](./quick-start.md).
