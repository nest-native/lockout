#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const workspacePackages = collectWorkspacePackages();
const packageLock = readJson('package-lock.json');
const samplePackagePaths = collectSamplePackagePaths();
const failures = [];

if (workspacePackages.length === 0) {
  throw new Error(
    'Sample version sync failed: no publishable packages/*/package.json found.',
  );
}

for (const packagePath of samplePackagePaths) {
  const samplePackage = readJson(packagePath);
  const lockPackagePath = path.dirname(packagePath);
  const lockEntry = packageLock.packages?.[lockPackagePath];
  const declaredPackages = workspacePackages.filter(
    ({ name }) => declaredVersion(samplePackage, name) !== undefined,
  );

  if (declaredPackages.length === 0) {
    failures.push(
      `${packagePath} declares none of the workspace packages (${workspacePackageNames()})`,
    );
    continue;
  }

  for (const { name, version } of declaredPackages) {
    const sampleVersion = declaredVersion(samplePackage, name);
    const lockVersion = declaredVersion(lockEntry, name);

    if (sampleVersion !== version) {
      failures.push(
        `${packagePath} declares ${name}@${sampleVersion ?? '<missing>'}; expected ${version}`,
      );
    }

    if (lockVersion !== version) {
      failures.push(
        `package-lock.json entry for ${lockPackagePath} resolves ${name}@${lockVersion ?? '<missing>'}; expected ${version}`,
      );
    }
  }
}

const workspaceResolution = readWorkspaceResolution();
for (const packagePath of samplePackagePaths) {
  const samplePackage = readJson(packagePath);
  const sampleResolution = workspaceResolution.dependencies?.[samplePackage.name];

  for (const { name, version } of workspacePackages) {
    if (declaredVersion(samplePackage, name) === undefined) {
      continue;
    }

    const resolvedVersion = sampleResolution?.dependencies?.[name]?.version;

    if (resolvedVersion !== version) {
      failures.push(
        `workspace ${samplePackage.name} resolves ${name}@${resolvedVersion ?? '<missing>'}; expected ${version}`,
      );
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Sample version sync failed:\n${failures.join('\n')}`);
}

console.log(
  `Sample version sync OK: ${samplePackagePaths.length} samples pin ${workspacePackageNames()}.`,
);

function collectWorkspacePackages() {
  const packagesRoot = path.join(repoRoot, 'packages');
  if (!fs.existsSync(packagesRoot)) {
    return [];
  }

  return fs
    .readdirSync(packagesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join('packages', entry.name, 'package.json'))
    .filter(packagePath => fs.existsSync(path.join(repoRoot, packagePath)))
    .map(packagePath => readJson(packagePath))
    .filter(packageJson => packageJson.private !== true)
    .map(({ name, version }) => ({ name, version }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function workspacePackageNames() {
  return workspacePackages.map(({ name, version }) => `${name}@${version}`).join(', ');
}

function declaredVersion(manifest, packageName) {
  return (
    manifest?.dependencies?.[packageName] ?? manifest?.devDependencies?.[packageName]
  );
}

function collectSamplePackagePaths() {
  const sampleRoot = path.join(repoRoot, 'sample');
  if (!fs.existsSync(sampleRoot)) {
    return [];
  }

  return fs
    .readdirSync(sampleRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join('sample', entry.name, 'package.json'))
    .filter(packagePath => fs.existsSync(path.join(repoRoot, packagePath)))
    .sort();
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function readWorkspaceResolution() {
  const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const output = runNpm(npmExecutable, [
    'ls',
    ...workspacePackages.map(({ name }) => name),
    '--workspaces',
    '--depth=0',
    '--json',
  ]);

  return JSON.parse(output);
}

function runNpm(npmExecutable, args) {
  try {
    return execFileSync(npmExecutable, args, { cwd: repoRoot, encoding: 'utf8' });
  } catch (error) {
    // `npm ls` exits non-zero when the tree has problems (a missing or invalid
    // dependency is exactly what this check is here to report), but it still
    // prints the JSON tree on stdout — keep it and let the assertions speak.
    if (typeof error.stdout === 'string' && error.stdout.trim() !== '') {
      return error.stdout;
    }

    throw error;
  }
}
