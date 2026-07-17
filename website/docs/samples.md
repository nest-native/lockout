---
sidebar_position: 5
title: Samples
---

# Samples

Three runnable samples live in the repository's
[`sample/`](https://github.com/nest-native/lockout/tree/main/sample) folder;
all three run in CI on every change.

## `00-showcase` — the engine, framework-free

A plain TypeScript walk through the full story against the in-memory store:
failures accumulate, the third one trips the lock, a `check` reports the
`Retry-After`, the cooloff elapses, and a success resets the counter. No
framework, no database — the smallest complete picture of the engine.

## `01-express-lockout` — the neutrality proof

A bare **Express** app whose `/login` route gates on `@authlock/core` directly
— `check` before the credential, `recordFailure`/`recordSuccess` after. Its
smoke test drives the app over real HTTP and asserts: three failures → **429 +
`Retry-After`**, the *correct* password still refused while locked, access
restored after the cooloff. Nothing in it imports NestJS or any DI container;
this sample is the acceptance guardrail that keeps the core framework-agnostic.

## `02-nestjs-lockout` — the NestJS reference app

A real NestJS application dogfooding `@nest-native/lockout` end to end:
`LockoutModule.forRoot` in the app module, `@UseGuards(LockoutGuard)` on the
login route, and `LockoutService.reportFailure`/`reportSuccess` in the handler.
Its smoke test boots the app and drives it over real HTTP through the same
lock → 429 → cooloff → 200 flow.

Swap the in-memory store for a [Drizzle store](./quick-start.md#a-shared-durable-store)
to make any of these production-shaped.
