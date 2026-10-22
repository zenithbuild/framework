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

const problems = [];
function verify(name, actual, required) {
    if (actual !== required) {
        problems.push(`${name}: expected ${required}, found ${actual || 'unavailable'}. Install ${name} ${required}.`);
    }
}
verify('Node', process.versions.node, nodeVersion);
for (const [name, command, required] of [
    ['Bun', 'bun', bunVersion],
    ['Rust', 'rustc', rustVersion],
    ['Cargo', 'cargo', rustVersion]
]) {
    const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
    const actual = result.status === 0 && !result.error
        ? /\b(\d+\.\d+\.\d+)\b/.exec(result.stdout || '')?.[1]
        : null;
    verify(name, actual, required);
}
if (problems.length) {
    console.error(`[Zenith:Toolchain] Use the repository's pinned toolchain before building:\n${problems.join('\n')}`);
    process.exitCode = 1;
} else {
    console.log(`[Zenith:Toolchain] Node ${nodeVersion}, Bun ${bunVersion}, Rust/Cargo ${rustVersion}`);
}
