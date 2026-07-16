// Public type surface for the framework-agnostic `@authlock/core` engine.
//
// SCAFFOLD PLACEHOLDER. The real contract lands in milestone C1 (see
// .plan/01-core.md): `Identifiers`, `LockoutParameter`, `FailureRecord`,
// the `LockoutStore` seam (`increment` / `get` / `clear` / `clearExpired`),
// `LockoutPolicy` (failure limit + tiered cooloff + whitelist predicate), and
// `LockoutManager` (`check` / `recordFailure` / `recordSuccess`). These are
// pure types + a zero-dependency engine — no NestJS, no DI, no Drizzle in the
// core. Drizzle is an OPTIONAL peer used only by the future `./drizzle` store.
//
// Empty module for now (kept out of coverage and the complexity gate) so the
// workspace installs and typechecks on an essentially-empty core.
export {};
