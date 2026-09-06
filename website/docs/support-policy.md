---
sidebar_position: 6
title: Support Policy
---

# Support policy

| Runtime | Supported line |
| --- | --- |
| Node.js | `>=22` |
| NestJS (`@nest-native/lockout` peer) | `^10.0.0 \|\| ^11.0.0 \|\| ^12.0.0` |
| `drizzle-orm` (`@authlock/core` optional peer) | `^0.44.0 \|\| ^0.45.0` |

`@authlock/core` has no runtime dependencies and no framework peer; only the
Drizzle-backed stores (`@authlock/core/drizzle` and the dialect subpaths) need
`drizzle-orm`, which is why it is an optional peer.

## How a major is adopted

A new peer major is **widened into the range, never swapped in**:

1. the published `peerDependencies` range widens to include the new major;
2. the devDependencies — and therefore the lockfile every default CI job
   installs — stay on the older major, so the default suite keeps testing that
   end;
3. a dedicated CI leg installs the newer major with `--no-save` on top of that
   lockfile and runs the suites and the samples.

Both ends of the range are then tested claims. NestJS 12 (released
2026-08-27; ESM-only; Node `>=20.19` / `>=22.12`) is the live example: the
`nestjs-latest-major` job installs `@nestjs/*@^12` in every workspace, proves
from inside the adapter and each sample that `@nestjs/core` resolved to 12,
and re-runs the adapter typecheck, both test suites, and the samples. A 10/11
matrix typechecks the adapter at the older end.

## What NestJS 12 changed, and what it means here

- **ESM-only, with an exports map.** A deep import that names a directory under
  `@nestjs/*` (for example `@nestjs/common/interfaces`) no longer resolves. The
  adapter imports only from the `@nestjs/common` and `@nestjs/core` roots, and
  the 12 leg fails on any directory import that ever creeps in.
- **Lifecycle hooks are ordered by module-hierarchy level.** Two providers may
  see the same hook in a different order than on 11. The adapter has no
  lifecycle hooks, so nothing here depends on that order.

## Dependabot

The `@nestjs/*` packages peer on each other, so a major that arrives as one
Dependabot PR per package cannot even install — `npm ci` fails with `ERESOLVE`
before a test runs. The peer group in `.github/dependabot.yml` therefore
groups majors as well as minors and patches, so the next major arrives as a
single PR whose CI result means something. That PR is input to the recipe
above, not a substitute for it.
