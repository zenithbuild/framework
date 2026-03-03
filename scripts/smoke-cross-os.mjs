#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const CLI_ENTRY = resolve(ROOT, 'packages/cli/dist/index.js');
const CLI_TOOLCHAIN_PATHS = resolve(ROOT, 'packages/cli/dist/toolchain-paths.js');

const PLATFORM_BINARIES = {
    'darwin-arm64': {
        packageName: '@zenithbuild/bundler-darwin-arm64',
        packageDir: 'packages/bundler-darwin-arm64',
        binaryName: 'zenith-bundler'
    },
    'darwin-x64': {
        packageName: '@zenithbuild/bundler-darwin-x64',
        packageDir: 'packages/bundler-darwin-x64',
        binaryName: 'zenith-bundler'
    },
    'linux-x64': {
        packageName: '@zenithbuild/bundler-linux-x64',
        packageDir: 'packages/bundler-linux-x64',
        binaryName: 'zenith-bundler'
    },
    'win32-x64': {
        packageName: '@zenithbuild/bundler-win32-x64',
        packageDir: 'packages/bundler-win32-x64',
        binaryName: 'zenith-bundler.exe'
    }
};

function writeJson(filePath, value) {
    writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function currentPlatformBinary() {
    const platformKey = `${process.platform}-${process.arch}`;
    const platformBinary = PLATFORM_BINARIES[platformKey];
    if (!platformBinary) {
        throw new Error(`Unsupported bundler smoke platform: ${platformKey}`);
    }
    return platformBinary;
}

function copyCompilerBinary(projectRoot) {
    const binaryName = process.platform === 'win32' ? 'zenith-compiler.exe' : 'zenith-compiler';
    const sourceBinary = resolve(ROOT, 'packages/compiler/target/release', binaryName);
    const compilerRoot = join(projectRoot, 'node_modules', '@zenithbuild', 'compiler');
    mkdirSync(join(compilerRoot, 'target', 'release'), { recursive: true });
    writeJson(join(compilerRoot, 'package.json'), {
        name: '@zenithbuild/compiler',
        version: '0.0.0-smoke',
        type: 'module'
    });
    copyFileSync(sourceBinary, join(compilerRoot, 'target', 'release', binaryName));
}

function copyBundlerPackages(projectRoot) {
    const platformBinary = currentPlatformBinary();
    const bundlerRoot = join(projectRoot, 'node_modules', '@zenithbuild', 'bundler');
    const platformRoot = join(
        projectRoot,
        'node_modules',
        '@zenithbuild',
        platformBinary.packageName.replace('@zenithbuild/', '')
    );
    const sourceBinary = resolve(ROOT, platformBinary.packageDir, 'bin', platformBinary.binaryName);

    if (!existsSync(sourceBinary)) {
        throw new Error(`Missing staged bundler platform binary: ${sourceBinary}`);
    }

    mkdirSync(bundlerRoot, { recursive: true });
    writeJson(join(bundlerRoot, 'package.json'), {
        name: '@zenithbuild/bundler',
        version: '0.0.0-smoke',
        type: 'module'
    });

    mkdirSync(join(platformRoot, 'bin'), { recursive: true });
    writeJson(join(platformRoot, 'package.json'), {
        name: platformBinary.packageName,
        version: '0.0.0-smoke',
        type: 'module'
    });
    copyFileSync(sourceBinary, join(platformRoot, 'bin', platformBinary.binaryName));
}

function createFixture() {
    const projectRoot = mkdtempSync(join(tmpdir(), 'zenith-cross-os-smoke-'));

    mkdirSync(join(projectRoot, 'src', 'pages'), { recursive: true });
    mkdirSync(join(projectRoot, 'node_modules', '@zenithbuild'), {
        recursive: true
    });

    writeJson(join(projectRoot, 'package.json'), {
        name: 'zenith-cross-os-smoke',
        private: true,
        type: 'module'
    });

    writeFileSync(
        join(projectRoot, 'src', 'pages', 'index.zen'),
        `<template>\n  <main>Cross-OS smoke</main>\n</template>\n`
    );

    copyCompilerBinary(projectRoot);
    copyBundlerPackages(projectRoot);

    return projectRoot;
}

async function assertBundlerResolution(projectRoot) {
    const { bundlerCommandCandidates } = await import(pathToFileURL(CLI_TOOLCHAIN_PATHS).href);
    const candidates = bundlerCommandCandidates(projectRoot, {});

    assert.equal(candidates[0]?.label, 'installed platform package binary');
}

function runSmoke(projectRoot) {
    const result = spawnSync(process.execPath, [CLI_ENTRY, 'build'], {
        cwd: projectRoot,
        env: {
            ...process.env,
            CI: '1',
            ZENITH_NO_UI: '1'
        },
        encoding: 'utf8'
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`.replace(/\r/g, '');

    assert.equal(result.status, 0, `cross-OS smoke build failed:\n${output}`);
    assert.equal(
        output.includes('bundler binary incompatible'),
        false,
        `bundler fallback should not trigger in fresh-install smoke:\n${output}`
    );
    assert.equal(output.includes('workspace binary'), false, `workspace fallback leaked into smoke output:\n${output}`);
    assert.equal(output.includes('ENOEXEC'), false, `raw ENOEXEC leaked into output:\n${output}`);
    assert.equal(existsSync(join(projectRoot, 'dist', 'index.html')), true, 'dist/index.html was not generated');
}

const projectRoot = createFixture();

try {
    await assertBundlerResolution(projectRoot);
    runSmoke(projectRoot);
    console.log('cross-os smoke passed');
} finally {
    rmSync(projectRoot, { recursive: true, force: true });
}
