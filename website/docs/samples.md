---
sidebar_position: 5
title: Samples
---

# Samples

:::warning Pre-release scaffold
The showcase currently exercises the scaffold (it links the core across the
workspace and asserts the version). It grows into a full end-to-end example as
the engine and the NestJS adapter land.
:::

- **`sample/00-showcase`** — a framework-free smoke of the `@authlock/core`
  engine. It will demonstrate the failure-count → lockout → cooloff → reset flow
  against the in-memory store, then the atomic Drizzle store.

A NestJS reference app (dogfooding `@nest-native/lockout` — `LockoutGuard` +
`LockoutService` wired into a login handler, plus the Passport recipe) is
planned for the adapter milestones.
