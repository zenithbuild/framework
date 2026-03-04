#!/usr/bin/env node

import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const PLATFORM_PACKAGES = {
    'darwin-arm64': {
        packageDir: 'packages/compiler-darwin-arm64',
        binaryName: 'zenith-compiler'
    },
    'darwin-x64': {
        packageDir: 'packages/compiler-darwin-x64',
        binaryName: 'zenith-compiler'
    },
    'linux-x64': {
        packageDir: 'packages/compiler-linux-x64',
        binaryName: 'zenith-compiler'
    },
    'win32-x64': {
        packageDir: 'packages/compiler-win32-x64',
        binaryName: 'zenith-compiler.exe'
    }
};

function currentPlatformKey() {
    return `${process.platform}-${process.arch}`;
}

function stageCurrentCompilerBinary() {
    const platformKey = process.env.COMPILER_PLATFORM_KEY || currentPlatformKey();
    const platform = PLATFORM_PACKAGES[platformKey];
    if (!platform) {
        throw new Error(`Unsupported compiler platform package target: ${platformKey}`);
    }

    const targetTriple = process.env.COMPILER_TARGET_TRIPLE || '';
    const targetDir = targetTriple
        ? resolve(ROOT, 'packages/compiler/target', targetTriple, 'release')
        : resolve(ROOT, 'packages/compiler/target/release');

    const sourceBinary = resolve(targetDir, platform.binaryName);
    if (!existsSync(sourceBinary)) {
        throw new Error(`Missing built compiler binary: ${sourceBinary}`);
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
    stageCurrentCompilerBinary();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
}
