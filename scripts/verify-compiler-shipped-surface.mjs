#!/usr/bin/env node
/**
 * Release-path gate: the staged compiler binary (same artifact npm packs for the current platform)
 * must expose `--merge-image-materialization`.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const PLATFORM = {
    'darwin-arm64': { dir: 'compiler-darwin-arm64', bin: 'zenith-compiler' },
    'darwin-x64': { dir: 'compiler-darwin-x64', bin: 'zenith-compiler' },
    'linux-x64': { dir: 'compiler-linux-x64', bin: 'zenith-compiler' },
    'win32-x64': { dir: 'compiler-win32-x64', bin: 'zenith-compiler.exe' }
};

const key = `${process.platform}-${process.arch}`;
const meta = PLATFORM[key];
if (!meta) {
    console.error(`verify-compiler-shipped-surface: unsupported platform ${key}`);
    process.exit(1);
}

const binaryPath = resolve(ROOT, 'packages', meta.dir, 'bin', meta.bin);
if (!existsSync(binaryPath)) {
    console.error(
        `Missing staged compiler at ${binaryPath}. Run build (compiler platform stage) first.`
    );
    process.exit(1);
}

const result = spawnSync(binaryPath, ['--help'], { encoding: 'utf8' });
if (result.error) {
    console.error(result.error);
    process.exit(1);
}
if (result.status !== 0) {
    console.error(result.stderr || result.stdout || 'compiler --help failed');
    process.exit(1);
}
const help = `${result.stdout}\n${result.stderr || ''}`;
if (!help.includes('merge-image-materialization')) {
    console.error(
        'Staged zenith-compiler --help must document --merge-image-materialization (Track B image artifact).'
    );
    process.exit(1);
}

console.log(`OK: ${binaryPath} exposes merge-image-materialization`);
