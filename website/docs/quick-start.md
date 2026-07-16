---
sidebar_position: 2
title: Quick Start
---

# Quick Start

:::warning Pre-release scaffold
The API below is the **planned** contract. Follow the repository's working plan
for implementation status.
:::

## Install

```bash
# framework-agnostic core
npm install @authlock/core

# or the NestJS adapter (pulls the core in for you)
npm install @nest-native/lockout
```

The Drizzle store is opt-in — install `drizzle-orm` and your driver only if you
use it:

```bash
npm install drizzle-orm better-sqlite3   # or pg / mysql2
```

## Framework-agnostic core (planned)

```ts
import {LockoutManager, InMemoryLockoutStore} from '@authlock/core';

const lockout = new LockoutManager({
  store: new InMemoryLockoutStore(),
  limit: 5,
  cooloffMs: 30 * 60_000,
  parameters: [['username'], ['ip']],
});

// pre-auth: reject if locked
const decision = await lockout.check({username, ip});
if (decision.locked) {
  // 429 + Retry-After: decision.retryAfterMs
}

// after your credential check
await (ok ? lockout.recordSuccess({username, ip})
          : lockout.recordFailure({username, ip}));
```

## NestJS adapter (planned)

Because NestJS has no ambient login-failure signal, wiring is explicit:

```ts
LockoutModule.forRoot({
  store: new InMemoryLockoutStore(),
  limit: 5,
  cooloffMs: 30 * 60_000,
  failMode: 'open',
});
```

Apply `LockoutGuard` before your auth guard, and call
`LockoutService.reportFailure(...)` / `reportSuccess(...)` from your login
handler. See the [API Reference](./api-reference.md).
