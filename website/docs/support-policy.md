---
sidebar_position: 6
title: Support Policy
---

# Support policy

| Runtime | Supported line |
| --- | --- |
| Node.js | `>=22` (`>=22.12` with NestJS 12 — see the note below the table) |
| NestJS (`@nest-native/lockout` peer) | `^10.0.0 \|\| ^11.0.0 \|\| ^12.0.0` |
| `drizzle-orm` (`@authlock/core` optional peer) | `^0.44.0 \|\| ^0.45.0` |

The Node.js floor depends on which end of the NestJS range you are on. NestJS
10 and 11 run on any Node.js `>=22`. NestJS 12 is ESM-only, and
`@nest-native/lockout` is CommonJS, so it (and the NestJS sample) loads 12
through Node's `require(esm)`, which is behind a flag before Node.js 22.12.0 —
the 12 end of the range needs Node.js `>=22.12`. `engines` stays `>=22`
because the 10 and 11 ends do not need more; Node 22.0–22.11 satisfies it and
still cannot load NestJS 12. CI's NestJS 12 leg runs on a current 22.x.

`@authlock/core` has no runtime dependencies and no framework peer, so its
floor is simply Node.js `>=22`; only the Drizzle-backed stores
(`@authlock/core/drizzle` and the dialect subpaths) need `drizzle-orm`, which
is why it is an optional peer.

## How a major is adopted

A new peer major is **widened into the range, never swapped in**:

1. the published `peerDependencies` range widens to include the new major;
2. the devDependencies — and therefore the lockfile every default CI job
   installs — stay on the older major, so the default suite keeps testing that
   end;
3. a dedicated CI leg installs the newer major with `--no-save` on top of that
   lockfile and runs the suites and the samples.

Both ends of the range are then tested claims. NestJS 12 (released
2026-08-27; ESM-only) is the live example: the `nestjs-latest-major` job
installs `@nestjs/*@^12` in every workspace, proves from inside every
workspace that each package it installed resolved to 12 from the root
`node_modules`, and re-runs the adapter typecheck, both test suites, and the
samples. A 10/11 matrix typechecks the adapter at the older end.

## What NestJS 12 changed, and what it means here

- **ESM-only, with an exports map.** A deep import that names a directory under
  `@nestjs/*` (for example `@nestjs/common/interfaces`) no longer resolves. The
  adapter imports only from the `@nestjs/common` and `@nestjs/core` roots, and
  the 12 leg fails on any directory import that ever creeps in.
- **Lifecycle hooks are ordered by module-hierarchy level.** Two providers may
  see the same hook in a different order than on 11. The adapter has no
  lifecycle hooks, so nothing here depends on that order.
- **Node.js floor.** Because 12 is ESM-only, CommonJS code — this adapter, the
  `ts-node` samples — loads it through Node's `require(esm)`, which is behind
  a flag before Node.js 22.12.0 (and 20.19.0 on the 20 line, below this
  package's floor). The 12 end of the range therefore needs Node.js `>=22.12`;
  `engines` stays `>=22` because the 10 and 11 ends do not need more.

## Dependabot

The `@nestjs/*` packages peer on each other, so a major that arrives as one
Dependabot PR per package cannot even install — `npm ci` fails with `ERESOLVE`
before a test runs. The peer group in `.github/dependabot.yml` therefore
groups majors as well as minors and patches, so the next major arrives as a
single PR whose CI result means something. That PR is input to the recipe
above, not a substitute for it.
