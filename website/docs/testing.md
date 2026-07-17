---
sidebar_position: 4
title: Testing
---

# Testing

This is a security control, so the test posture is strict: the core package is
held to **100% coverage** (branches, functions, lines, statements) and a
SonarJS cognitive-complexity ceiling of 15 — and the whole suite runs without
Docker.

## How your own tests can use it

The engine takes an injectable clock (`now`) and ships a single-process
`InMemoryLockoutStore`, so lockout flows are testable hermetically and
deterministically:

```ts
let clock = 0;
const manager = new LockoutManager({
  store: new InMemoryLockoutStore(),
  limit: 3,
  cooloffMs: 60_000,
  parameters: [['username']],
  now: () => clock,
});

// …trip the lock, then:
clock = 60_000; // the cooloff has elapsed — no sleeping in tests
```

## How the library itself is tested

- **One store contract, every backend.** A shared behavioral contract runs
  against the in-memory store, the Postgres store, the SQLite store — and,
  gated, against real servers — so every backend is held to identical
  semantics, including the window reset.
- **Real database engines in-process.** The Postgres store is exercised through
  [PGlite](https://pglite.dev/) (the actual Postgres engine compiled to WASM)
  and the SQLite store through `better-sqlite3` — the stores' real
  `ON CONFLICT … RETURNING` SQL runs on every `npm test`, no services needed.
  MySQL has no in-process engine, so its store drives the real
  `drizzle-orm/mysql2` query builder against a recording fake client.
- **Concurrency / no lost updates.** 25 simultaneous `increment` calls must
  yield a count of exactly 25 — the cross-instance atomicity guarantee — run
  hermetically and against real Postgres and MySQL.
- **Both failure modes.** `failMode: 'open'` (allow + log on store error) and
  `'closed'` (deny) each have dedicated paths through the manager and the
  NestJS guard.
- **Neutrality acceptance.** A bare-Express sample proves the core works with
  zero framework coupling, over real HTTP.
- **Gated real-server round-trips.** With `LOCKOUT_POSTGRES_URL` /
  `LOCKOUT_MYSQL_URL` set (CI provisions services; locally
  `npm run infra:up && npm run test:full`), the same store contract runs
  against live Postgres and MySQL.
