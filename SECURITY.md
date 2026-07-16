# Security Policy

Thank you for helping keep `@authlock/core` and `@nest-native/lockout` safe.
This is security-critical code — a login lockout engine is a security control —
so correctness reports are especially welcome.

## Supported Versions

Security fixes target the current published package line.

| Package | Supported |
| --- | --- |
| `@authlock/core` latest minor | Yes |
| `@nest-native/lockout` latest minor | Yes |
| Older unpublished branches | No |

## Reporting A Vulnerability

Please do not open a public issue for vulnerabilities or suspected secret
leakage.

Use GitHub's private vulnerability reporting for this repository when available:

<https://github.com/nest-native/lockout/security/advisories/new>

If private reporting is unavailable, contact the maintainer through the GitHub
profile and include only the minimum information needed to establish a private
channel. Do not send exploit details, credentials, tokens, database URLs, or
user data in public comments.

## What To Include

Private reports are most useful when they include:

- Affected package version or commit.
- Node, NestJS, Drizzle ORM, and database driver versions (as applicable).
- The smallest reproduction or vulnerable code path.
- Expected impact, such as:
  - **Lockout bypass** — a locked identity is still allowed to attempt login.
  - **Lockout amplification / denial of service** — an attacker locks a victim
    out by spoofing the victim's identity dimensions (e.g. a forged username or
    `X-Forwarded-For` IP), or exhausts the store.
  - **fail-mode error** — the engine fails open when configured closed, or vice
    versa, or a store error is mishandled.
  - **Cross-instance counting error** — the atomic increment miscounts under
    concurrency, letting attempts exceed the configured limit.
  - Secret leakage, dependency confusion, or incorrect exception behavior.
- Whether the issue affects package code, samples, docs, CI, or release
  automation.

Please redact secrets, hostnames, tokens, connection strings, and private user
data.

## Project Security Boundaries

These packages implement failed-authentication lockout. Applications still own:

- The credential check itself, session management, and password storage.
- **Identity extraction and proxy trust** — deciding which header carries the
  real client IP (`X-Forwarded-For` handling) is the application's
  responsibility; the library exposes an extractor hook and does not trust
  proxy headers by default.
- Database credentials, pool sizing, TLS, and network access for the store.
- Whether to run `failMode: 'open'` (availability-first, the default) or
  `'closed'` (security-first).
- Rate limiting (a distinct concern — use `@nestjs/throttler`).

Security fixes in this repository focus on package behavior, samples, docs,
release automation, and patterns that could encourage unsafe usage.

## Disclosure

The maintainer will acknowledge valid private reports as soon as practical,
coordinate a fix when the issue is in scope, and publish release notes or an
advisory when public disclosure is appropriate.
