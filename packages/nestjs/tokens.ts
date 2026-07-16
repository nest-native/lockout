// DI tokens for the adapter. `Symbol.for` keeps them stable across module
// instances and duplicate package copies.

/** The `LockoutManager` instance built from the module options. */
export const LOCKOUT_MANAGER = Symbol.for('@nest-native/lockout:manager');

/** The resolved `LockoutModuleOptions` (the guard reads the extractor from it). */
export const LOCKOUT_OPTIONS = Symbol.for('@nest-native/lockout:options');
