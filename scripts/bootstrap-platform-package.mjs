#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function printUsage() {
  console.error(
    'Usage: node scripts/bootstrap-platform-package.mjs [--dry-run] <packageDir> <packageName> <version> <registry>'
  );
}

function parseArgs(argv) {
  const args = [...argv];
  let dryRun = false;

  if (args[0] === '--dry-run') {
    dryRun = true;
    args.shift();
  }

  if (args.length !== 4) {
    printUsage();
    process.exit(1);
  }

  const [packageDir, packageName, version, registry] = args;
  return { dryRun, packageDir, packageName, version, registry };
}

function runNpm(args, options = {}) {
  const npmBin = process.env.NPM_BIN;

  if (npmBin) {
    return spawnSync(npmBin, args, {
      encoding: 'utf8',
      ...options
    });
  }

  if (process.platform === 'win32') {
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...args], {
      encoding: 'utf8',
      ...options
    });
  }

  return spawnSync('npm', args, {
    encoding: 'utf8',
    ...options
  });
}

function npmViewMissing(stderr, stdout) {
  const combined = `${stdout || ''}\n${stderr || ''}`;
  return /E404|code E404|404|Not Found/i.test(combined);
}

function ensureVersionMissing(packageName, version, registry) {
  const result = runNpm(
    ['view', `${packageName}@${version}`, 'version', '--json', '--loglevel=error', '--registry', registry]
  );

  if (result.status === 0) {
    return false;
  }

  if (npmViewMissing(result.stderr, result.stdout)) {
    return true;
  }

  const detail = result.stderr || result.stdout || `npm view failed for ${packageName}@${version}\n`;
  process.stderr.write(`Failed to check npm for ${packageName}@${version}:\n${detail}`);
  process.exit(result.status || 1);
}

function publishPackage(packageDir, registry) {
  const result = runNpm(['publish', '--access', 'public', '--registry', registry], {
    cwd: resolve(packageDir)
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `npm publish failed for ${packageDir}\n`);
    process.exit(result.status || 1);
  }
}

const { dryRun, packageDir, packageName, version, registry } = parseArgs(process.argv.slice(2));
const missing = ensureVersionMissing(packageName, version, registry);

if (!missing) {
  console.log(`skipped ${packageName}@${version} (already published)`);
  process.exit(0);
}

if (dryRun) {
  console.log(`dry-run: would publish ${packageName}@${version} from ${packageDir}`);
  process.exit(0);
}

publishPackage(packageDir, registry);
console.log(`published ${packageName}@${version}`);
