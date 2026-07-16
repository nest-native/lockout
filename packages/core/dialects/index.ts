// Umbrella `@authlock/core/drizzle` entry: the table factories and stores for
// all three dialects. Importing this pulls `drizzle-orm` (the optional peer)
// but NO database driver — the driver is whatever you pass the store. Prefer the
// per-dialect subpaths (`@authlock/core/postgres` etc.) when you only need one.
export * from './postgres';
export * from './sqlite';
export * from './mysql';
