import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const nodeExecutable = process.execPath;
const repoRoot = process.cwd();
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'authlock-core-consumer-'),
);
const consumerRoot = path.join(tempRoot, 'consumer');
const npmCache = path.join(tempRoot, 'npm-cache');

try {
  fs.mkdirSync(consumerRoot);

  const tarballPath = packTarball();
  writeConsumerPackage(tarballPath);
  writeConsumerSmoke();

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
      env: {
        ...process.env,
        npm_config_cache: npmCache,
      },
    },
  );
  execFileSync(nodeExecutable, ['smoke.cjs'], {
    cwd: consumerRoot,
    stdio: 'inherit',
  });

  console.log('Packed consumer validation OK.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function packTarball() {
  const rawOutput = execFileSync(
    npmExecutable,
    [
      'pack',
      '--json',
      '--workspace',
      '@authlock/core',
      '--pack-destination',
      tempRoot,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_cache: npmCache,
      },
    },
  );
  const [packResult] = JSON.parse(rawOutput);

  if (!packResult?.filename) {
    throw new Error('npm pack did not produce a tarball filename.');
  }

  return path.join(tempRoot, packResult.filename);
}

function writeConsumerPackage(tarballPath) {
  // The core installs with zero third-party production dependencies — the whole
  // point of the empty `"dependencies": {}` contract.
  fs.writeFileSync(
    path.join(consumerRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'authlock-core-packed-consumer',
        private: true,
        type: 'commonjs',
        dependencies: {
          '@authlock/core': `file:${tarballPath}`,
        },
      },
      null,
      2,
    )}\n`,
  );
}

function writeConsumerSmoke() {
  fs.writeFileSync(
    path.join(consumerRoot, 'smoke.cjs'),
    `'use strict';

const assert = require('node:assert/strict');
const core = require('@authlock/core');
const packageJson = require('@authlock/core/package.json');

// The documented public surface resolves from the packed tarball.
assert.equal(typeof core.VERSION, 'string', 'missing core export: VERSION');
assert.equal(core.VERSION, packageJson.version, 'VERSION must match package.json');
for (const name of ['LockoutManager', 'InMemoryLockoutStore', 'deriveKeys']) {
  assert.equal(typeof core[name], 'function', 'missing core export: ' + name);
}

// The main entry pulls NO drizzle-orm — importing '@authlock/core' above with
// nothing but the tarball installed already proves that.

// Each Drizzle store subpath is declared and RESOLVES from the packed tarball.
// We resolve (not require) them so this check needs no drizzle-orm installed —
// it validates the exports map and shipped files, exactly what a consumer sees.
for (const subpath of ['./drizzle', './postgres', './sqlite', './mysql']) {
  assert.ok(packageJson.exports[subpath], 'missing export map entry: ' + subpath);
  require.resolve('@authlock/core/' + subpath.slice(2));
}

// The published package declares zero runtime dependencies (consumers only pull
// the OPTIONAL drizzle-orm peer if they use a Drizzle store subpath).
assert.equal(
  Object.keys(packageJson.dependencies ?? {}).length,
  0,
  'The packed package must not declare runtime dependencies.',
);
`,
  );
}
