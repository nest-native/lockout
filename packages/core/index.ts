// Public entrypoint for `@authlock/core` — the framework-agnostic, zero-runtime-
// dependency login-lockout engine. Usable from Express, inversify, tsyringe, a
// bare script, or the `@nest-native/lockout` DI adapter.
//
// SCAFFOLD: only the version constant + the (empty) type surface are wired up.
// The engine (`LockoutManager`, `LockoutPolicy`, `InMemoryLockoutStore`) lands
// in milestone C2, and the Drizzle store ships from the `./drizzle` subpath
// (milestone C3). Planned subpaths: `.`, `./drizzle`, `./sqlite`, `./postgres`,
// `./mysql`, `./testing`. See .plan/01-core.md.
export * from './interfaces';
export { VERSION } from './version';
