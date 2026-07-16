import { strict as assert } from 'node:assert';
import { VERSION } from '@authlock/core';
import { describeCore } from '../src/showcase';

// Scaffold smoke: proves a plain (non-NestJS) consumer resolves the published
// `@authlock/core` engine across the workspace and can call into it. The full
// end-to-end lockout demonstration replaces this body as the engine lands.
function main(): void {
  assert.equal(VERSION, '0.0.0', 'core version resolved from the workspace link');
  assert.equal(describeCore(), '@authlock/core v0.0.0');
  console.log(
    `Showcase smoke passed: linked the framework-free @authlock/core engine (v${VERSION}).`,
  );
}

main();
