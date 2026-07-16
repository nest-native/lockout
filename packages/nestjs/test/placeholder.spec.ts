import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { CORE_VERSION, VERSION } from '../index';

// Scaffold placeholder: proves the adapter package builds, imports, and links
// to the `@authlock/core` engine across the workspace. The adapter is a thin DI
// shell and is deliberately NOT held to the core's 100% coverage bar — its real
// specs (LockoutGuard reject-if-locked, LockoutService report* wiring, failMode
// open/closed, the Nest 10/11/12 compat lanes) arrive in the N-series
// milestones (see .plan/02-nestjs.md).
describe('@nest-native/lockout (scaffold)', () => {
  it('exposes a version constant', () => {
    assert.equal(VERSION, '0.0.0');
  });

  it('re-exports the linked core engine version', () => {
    assert.equal(CORE_VERSION, '0.0.0');
  });
});
