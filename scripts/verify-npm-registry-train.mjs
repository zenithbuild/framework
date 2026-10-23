#!/usr/bin/env node
/**
 * Post-publish check: assert npm registry has the lockstep packages at TRAIN_VERSION.
 * Usage: from repo root, after publishing — `node scripts/verify-npm-registry-train.mjs`
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const trainVersion = readFileSync(resolve(ROOT, 'TRAIN_VERSION'), 'utf8').trim();

const PACKAGES = [
    '@zenithbuild/compiler',
    '@zenithbuild/compiler-darwin-arm64',
    '@zenithbuild/compiler-darwin-x64',
    '@zenithbuild/compiler-linux-x64',
    '@zenithbuild/compiler-win32-x64'
];

let failed = false;
for (const name of PACKAGES) {
    const spec = `${name}@${trainVersion}`;
    const r = spawnSync(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['view', spec, 'version', '--json'],
        { encoding: 'utf8', shell: false }
    );
    const out = (r.stdout || '').trim();
    if (r.status !== 0 || !out) {
        console.error(`MISSING or error: ${spec}`);
        console.error((r.stderr || '').trim() || out || `exit ${r.status}`);
        failed = true;
        continue;
    }
    let version;
    try {
        version = JSON.parse(out);
    } catch {
        version = out.replace(/^"|"$/g, '');
    }
    if (version !== trainVersion) {
        console.error(`VERSION MISMATCH ${spec}: got ${version}`);
        failed = true;
        continue;
    }
    console.log(`OK ${spec}`);
}

if (failed) {
    process.exit(1);
}
