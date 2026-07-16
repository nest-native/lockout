import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

// Gated store round-trip specs. These stay OUT of the default `npm test` path
// (they live under test/integration, which the hermetic runner does not load)
// and skip unless their database URL is set — exactly like the future Drizzle
// store contract tests will. Bring the stack up with `npm run infra:up` and run
// `npm run test:full`, or point the env vars at your own databases and run
// `npm run test:integration`.
//
// SCAFFOLD PLACEHOLDER: today these only assert the connection URL is well
// formed. Milestone C3 replaces the body with a real atomic-increment /
// clear-on-success round-trip against a live server (proving the store's
// cross-instance concurrency guarantee — the security-critical invariant).
const postgresUrl = process.env.LOCKOUT_POSTGRES_URL;
const mysqlUrl = process.env.LOCKOUT_MYSQL_URL;

describe('LockoutStore integration (gated)', () => {
  it(
    'has a reachable Postgres URL',
    { skip: postgresUrl ? false : 'LOCKOUT_POSTGRES_URL is not set' },
    () => {
      const url = new URL(postgresUrl as string);
      assert.match(url.protocol, /^postgres(ql)?:$/);
    },
  );

  it(
    'has a reachable MySQL URL',
    { skip: mysqlUrl ? false : 'LOCKOUT_MYSQL_URL is not set' },
    () => {
      const url = new URL(mysqlUrl as string);
      assert.equal(url.protocol, 'mysql:');
    },
  );
});
