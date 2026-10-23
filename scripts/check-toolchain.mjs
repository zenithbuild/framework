#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8').trim();
const nodeVersion = read('.node-version');
const packageManager = JSON.parse(read('package.json')).packageManager;
const bunVersion = /^bun@(\d+\.\d+\.\d+)$/.exec(packageManager || '')?.[1];
const rustVersion = /^channel\s*=\s*"([^"]+)"/m.exec(read('rust-toolchain.toml'))?.[1];
if (!bunVersion || !rustVersion || !/^\d+\.\d+\.\d+$/.test(nodeVersion)) {
    throw new Error('[Zenith:Toolchain] Expected exact Node, Bun and Rust version pins.');
}

// CI stays exact so runs are reproducible. Locally, a newer patch on the same
// major.minor passes for tools whose patch releases are fixes only:
// - Node: patch releases within a release line are bug and security fixes.
// - Rust/Cargo: point releases fix regressions and security issues only.
// - Bun stays exact everywhere: its patch releases change install, lockfile,
//   bundler and runtime behavior, so a newer patch is a different toolchain.
const isSet = (value) => value !== undefined && !['', '0', 'false'].includes(value.toLowerCase());
const exactMode = isSet(process.env.CI) || isSet(process.env.GITHUB_ACTIONS);
const mode = exactMode ? 'exact (CI)' : 'patch-tolerant (local)';
const parse = (version) => version.split('.').map(Number);

const problems = [];
const accepted = [];
function verify(name, actual, required, patchSafe) {
    const tolerant = patchSafe && !exactMode;
    const [major, minor, patch] = parse(required);
    const rule = tolerant ? `${major}.${minor}.x with x >= ${patch}` : `exactly ${required}`;
    let ok = actual === required;
    if (!ok && tolerant && actual) {
        const [aMajor, aMinor, aPatch] = parse(actual);
        ok = aMajor === major && aMinor === minor && aPatch >= patch;
    }
    if (!ok) {
        problems.push(`${name}: expected ${required}, found ${actual || 'unavailable'} (needs ${rule}). Install ${name} ${required}.`);
    } else {
        accepted.push(actual === required ? `${name} ${actual}` : `${name} ${actual} (pinned ${required}, newer patch)`);
    }
}
verify('Node', process.versions.node, nodeVersion, true);
for (const [name, command, required, patchSafe] of [
    ['Bun', 'bun', bunVersion, false],
    ['Rust', 'rustc', rustVersion, true],
    ['Cargo', 'cargo', rustVersion, true]
]) {
    const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
    const actual = result.status === 0 && !result.error
        ? /\b(\d+\.\d+\.\d+)\b/.exec(result.stdout || '')?.[1]
        : null;
    verify(name, actual, required, patchSafe);
}
if (problems.length) {
    console.error(`[Zenith:Toolchain] Mode: ${mode}. Use the repository's pinned toolchain before building:\n${problems.join('\n')}`);
    process.exitCode = 1;
} else {
    console.log(`[Zenith:Toolchain] Mode: ${mode}. Pinned Node ${nodeVersion}, Bun ${bunVersion}, Rust/Cargo ${rustVersion}; found ${accepted.join(', ')}`);
}
