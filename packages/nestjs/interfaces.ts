import type { Identifiers, LockoutManagerOptions } from '@authlock/core';
import type { ExecutionContext, ModuleMetadata, Type } from '@nestjs/common';

/**
 * Turns a request (via the NestJS execution context) into the identity
 * dimensions the engine keys on. Identity extraction is the application's trust
 * decision — a custom extractor is how you decide which header or claim to
 * trust, and whether to believe a proxy.
 */
export type IdentifierExtractor = (context: ExecutionContext) => Identifiers;

/**
 * Options for {@link LockoutModule.forRoot}. Everything a `LockoutManager`
 * takes (store, limit, cooloff, tiers, parameters, whitelist, failMode,
 * onLockout, logger), plus the NestJS-only extractor and module scope.
 */
export interface LockoutModuleOptions extends LockoutManagerOptions {
  /** How to read identity dimensions off a request. Defaults to {@link defaultExtractor}. */
  extractor?: IdentifierExtractor;
  /** Register as a global module so the guard/service resolve app-wide. Default `true`. */
  isGlobal?: boolean;
}

/** Options for {@link LockoutModule.forRootAsync}. */
export interface LockoutModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  // `any[]` (not `unknown[]`) mirrors NestJS's own `FactoryProvider.useFactory`:
  // under `strictFunctionTypes` a factory declared with typed injected params —
  // the common case, e.g. `(db: MyDatabase) => (...)` fed by `inject` — is NOT
  // assignable to `(...args: unknown[]) => ...`, forcing callers to widen to
  // `unknown` and re-narrow. `any[]` lets typed factories assign directly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFactory: (
    ...args: any[]
  ) => LockoutModuleOptions | Promise<LockoutModuleOptions>;
  inject?: Array<Type<unknown> | string | symbol>;
  isGlobal?: boolean;
}
