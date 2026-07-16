import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { VERSION } from '../index';

// Scaffold placeholder: proves the core package builds, imports, and reports
// its version. It also keeps the 100% coverage gate honest on an
// essentially-empty core (version.ts is the only measured source file). The
// real engine specs — atomic-increment concurrency, tiered cooloff, fail-open
// vs fail-closed, the bare-Express neutrality acceptance test — arrive with the
// engine in milestone C2 (see .plan/01-core.md).
describe('@authlock/core (scaffold)', () => {
  it('exposes a version constant', () => {
    assert.equal(typeof VERSION, 'string');
    assert.equal(VERSION, '0.0.0');
  });
});
