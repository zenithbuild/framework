#!/usr/bin/env node

import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const PLATFORM_PACKAGES = {
    'darwin-arm64': {
        packageDir: 'packages/bundler-darwin-arm64',
        binaryName: 'zenith-bundler'
    },
    'darwin-x64': {
        packageDir: 'packages/bundler-darwin-x64',
        binaryName: 'zenith-bundler'
    },
    'linux-x64': {
        packageDir: 'packages/bundler-linux-x64',
        binaryName: 'zenith-bundler'
    },
    'win32-x64': {
        packageDir: 'packages/bundler-win32-x64',
        binaryName: 'zenith-bundler.exe'
    }
};

function currentPlatformKey() {
    return `${process.platform}-${process.arch}`;
}

function stageCurrentBundlerBinary() {
    const platformKey = process.env.BUNDLER_PLATFORM_KEY || currentPlatformKey();
    const platform = PLATFORM_PACKAGES[platformKey];
    if (!platform) {
        throw new Error(`Unsupported bundler platform package target: ${platformKey}`);
    }

    const targetTriple = process.env.BUNDLER_TARGET_TRIPLE || '';
    const targetDir = targetTriple
        ? resolve(ROOT, 'packages/bundler/target', targetTriple, 'release')
        : resolve(ROOT, 'packages/bundler/target/release');

    const sourceBinary = resolve(
        targetDir,
        platform.binaryName
    );
    if (!existsSync(sourceBinary)) {
        throw new Error(`Missing built bundler binary: ${sourceBinary}`);
    }

    const packageRoot = resolve(ROOT, platform.packageDir);
    const binDir = resolve(packageRoot, 'bin');
    mkdirSync(binDir, { recursive: true });
    for (const entry of readdirSync(binDir)) {
        rmSync(resolve(binDir, entry), { recursive: true, force: true });
    }

    const destinationBinary = resolve(binDir, platform.binaryName);
    copyFileSync(sourceBinary, destinationBinary);
    if (process.platform !== 'win32') {
        chmodSync(destinationBinary, 0o755);
    }

    process.stdout.write(`${platform.packageDir}\n`);
}

try {
    stageCurrentBundlerBinary();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
}
