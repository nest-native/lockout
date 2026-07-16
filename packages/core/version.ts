// The published package version, exposed as a runtime constant so consumers and
// adapters (e.g. @nest-native/lockout) can surface it without reading
// package.json. Kept in its own module so the barrel (index.ts) stays a pure
// re-export surface. Bump in lockstep with package.json on every release.
export const VERSION = '0.1.0';
