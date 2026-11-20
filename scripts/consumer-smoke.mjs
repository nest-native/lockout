import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// The consumer smoke of both release checks: check-packed-consumer.mjs runs it
// against the packed tarball, check-published-release.mjs against the version
// on the registry. This is its only copy.

const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const nodeExecutable = process.execPath;

// Installs `packageName` from `packageSpec` (a `file:` tarball or a registry
// version) into an empty CommonJS consumer at `consumerRoot`, then runs the
// smoke against it.
export function runConsumerSmoke({
  consumerRoot,
  consumerName,
  packageName,
  packageSpec,
  env,
}) {
  writeConsumerPackage({
    consumerRoot,
    consumerName,
    packageName,
    packageSpec,
  });
  writeConsumerSmoke(consumerRoot, packageName);

  execFileSync(
    npmExecutable,
    [
      'install',
      '--package-lock=false',
      '--no-audit',
      '--fund=false',
      '--ignore-scripts',
    ],
    {
      cwd: consumerRoot,
      stdio: 'inherit',
      env,
    },
  );
  execFileSync(nodeExecutable, ['smoke.cjs'], {
    cwd: consumerRoot,
    stdio: 'inherit',
  });
}

function writeConsumerPackage({
  consumerRoot,
  consumerName,
  packageName,
  packageSpec,
}) {
  // The core installs with zero third-party production dependencies — the whole
  // point of the empty `"dependencies": {}` contract.
  fs.writeFileSync(
    path.join(consumerRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: consumerName,
        private: true,
        type: 'commonjs',
        dependencies: {
          [packageName]: packageSpec,
        },
      },
      null,
      2,
    )}\n`,
  );
}

export function writeConsumerSmoke(consumerRoot, packageName) {
  fs.writeFileSync(
    path.join(consumerRoot, 'smoke.cjs'),
    `'use strict';

const assert = require('node:assert/strict');
const core = require('${packageName}');
const packageJson = require('${packageName}/package.json');

// The documented public surface resolves from the installed package.
assert.equal(typeof core.VERSION, 'string', 'missing core export: VERSION');
assert.equal(core.VERSION, packageJson.version, 'VERSION must match package.json');
for (const name of ['LockoutManager', 'InMemoryLockoutStore', 'deriveKeys']) {
  assert.equal(typeof core[name], 'function', 'missing core export: ' + name);
}

// The main entry pulls NO drizzle-orm — importing '${packageName}' above with
// nothing but the package installed already proves that.

// Each Drizzle store subpath is declared and RESOLVES from the installed package.
// We resolve (not require) them so this check needs no drizzle-orm installed —
// it validates the exports map and shipped files, exactly what a consumer sees.
for (const subpath of ['./drizzle', './postgres', './sqlite', './mysql']) {
  assert.ok(packageJson.exports[subpath], 'missing export map entry: ' + subpath);
  require.resolve('${packageName}/' + subpath.slice(2));
}

// The published package declares zero runtime dependencies (consumers only pull
// the OPTIONAL drizzle-orm peer if they use a Drizzle store subpath).
assert.equal(
  Object.keys(packageJson.dependencies ?? {}).length,
  0,
  'The installed package must not declare runtime dependencies.',
);
`,
  );
}
