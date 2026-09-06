/**
 * Proves which NestJS major every workspace actually resolves, and from where.
 *
 * Usage: node scripts/check-nestjs-major.mjs <major>
 *
 * The `nestjs-latest-major` CI leg installs the NestJS 12 set on top of the
 * 11.x lockfile with `npm install --no-save --workspaces
 * --include-workspace-root`. The adapter workspace and the NestJS sample
 * declare `@nestjs/*` at ^11 themselves, so an install that is not applied to
 * every workspace leaves each of them a nested 11 while the root moves to 12 —
 * and the suites then "pass on 12" while running on 11. This script resolves
 * every package the leg installs from inside every workspace, the same way
 * Node does at runtime, prints the version and location it finds, and fails
 * unless each one is the requested major served from the root node_modules.
 *
 * NestJS 12 does not export ./package.json, so the version is read by walking
 * up from the resolved entry point to the manifest that owns it.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// Every @nestjs/* package the nestjs-latest-major leg installs. Each one is
// checked from every workspace, declared there or not: the samples that do
// not use NestJS still resolve these from the root, and a nested copy under
// any workspace is exactly what this check exists to catch.
const LEG_PACKAGES = [
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/platform-express',
  '@nestjs/testing',
];

const expectedMajor = Number.parseInt(process.argv[2] ?? '', 10);
if (!Number.isInteger(expectedMajor)) {
  console.error('Usage: node scripts/check-nestjs-major.mjs <major>');
  process.exit(2);
}

const repoRoot = process.cwd();
const rootManifest = readJson(path.join(repoRoot, 'package.json'));
const workspaces = ['.', ...rootManifest.workspaces.flatMap(expandWorkspaceGlob)];
const failures = [];

for (const workspace of workspaces) {
  const workspaceDir = path.join(repoRoot, workspace);
  const localRequire = createRequire(path.join(workspaceDir, 'package.json'));

  for (const name of LEG_PACKAGES) {
    const expectedDir = path.join(repoRoot, 'node_modules', name);
    let resolved;
    try {
      resolved = findPackageRoot(localRequire.resolve(name), name);
    } catch (error) {
      failures.push(`${workspace}: ${name} does not resolve (${error.message})`);
      console.log(`${workspace.padEnd(26)} ${name.padEnd(26)} ${'<unresolved>'.padEnd(10)} UNRESOLVED`);
      continue;
    }

    const { dir, version } = resolved;
    const major = Number.parseInt(version.split('.')[0], 10);
    const location = path.relative(repoRoot, dir);
    const problems = [];
    if (major !== expectedMajor) {
      problems.push('WRONG MAJOR');
    }
    if (dir !== expectedDir) {
      problems.push('NOT FROM ROOT node_modules');
    }

    const status = problems.length === 0 ? 'ok' : problems.join(', ');
    console.log(`${workspace.padEnd(26)} ${name.padEnd(26)} ${version.padEnd(10)} <- ${location}  ${status}`);
    if (problems.length > 0) {
      failures.push(`${workspace}: ${name} resolves to ${version} from ${location} (${status})`);
    }
  }
}

if (failures.length > 0) {
  console.error(
    `\nExpected every workspace to resolve ${LEG_PACKAGES.join(', ')} at ${expectedMajor}.x from the root node_modules, but:\n- ${failures.join('\n- ')}`,
  );
  process.exit(1);
}

console.log(
  `\nEvery workspace (${workspaces.length}) resolves ${LEG_PACKAGES.join(', ')} at ${expectedMajor}.x from the root node_modules.`,
);

function expandWorkspaceGlob(pattern) {
  // Only the `dir/*` shape is used in this repo's `workspaces` field.
  const [parent, star] = pattern.split('/');
  if (star !== '*') {
    return [pattern];
  }
  return fs
    .readdirSync(path.join(repoRoot, parent), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => `${parent}/${entry.name}`)
    .filter(dir => fs.existsSync(path.join(repoRoot, dir, 'package.json')));
}

function findPackageRoot(resolvedFile, name) {
  let current = path.dirname(resolvedFile);
  for (;;) {
    const manifestPath = path.join(current, 'package.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = readJson(manifestPath);
      if (manifest.name === name) {
        return { dir: current, version: manifest.version };
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`could not find the package root of ${name} above ${resolvedFile}`);
    }
    current = parent;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
