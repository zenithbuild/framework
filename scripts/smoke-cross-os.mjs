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
    compiler: {
        'darwin-arm64': {
            packageName: '@zenithbuild/compiler-darwin-arm64',
            packageDir: 'packages/compiler-darwin-arm64',
            packageDirName: 'compiler-darwin-arm64',
            binaryName: 'zenith-compiler'
        },
        'darwin-x64': {
            packageName: '@zenithbuild/compiler-darwin-x64',
            packageDir: 'packages/compiler-darwin-x64',
            packageDirName: 'compiler-darwin-x64',
            binaryName: 'zenith-compiler'
        },
        'linux-x64': {
            packageName: '@zenithbuild/compiler-linux-x64',
            packageDir: 'packages/compiler-linux-x64',
            packageDirName: 'compiler-linux-x64',
            binaryName: 'zenith-compiler'
        },
        'win32-x64': {
            packageName: '@zenithbuild/compiler-win32-x64',
            packageDir: 'packages/compiler-win32-x64',
            packageDirName: 'compiler-win32-x64',
            binaryName: 'zenith-compiler.exe'
        }
    },
    bundler: {
        'darwin-arm64': {
            packageName: '@zenithbuild/bundler-darwin-arm64',
            packageDir: 'packages/bundler-darwin-arm64',
            packageDirName: 'bundler-darwin-arm64',
            binaryName: 'zenith-bundler'
        },
        'darwin-x64': {
            packageName: '@zenithbuild/bundler-darwin-x64',
            packageDir: 'packages/bundler-darwin-x64',
            packageDirName: 'bundler-darwin-x64',
            binaryName: 'zenith-bundler'
        },
        'linux-x64': {
            packageName: '@zenithbuild/bundler-linux-x64',
            packageDir: 'packages/bundler-linux-x64',
            packageDirName: 'bundler-linux-x64',
            binaryName: 'zenith-bundler'
        },
        'win32-x64': {
            packageName: '@zenithbuild/bundler-win32-x64',
            packageDir: 'packages/bundler-win32-x64',
            packageDirName: 'bundler-win32-x64',
            binaryName: 'zenith-bundler.exe'
        }
    }
};

function writeJson(filePath, value) {
    writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function currentPlatformBinary(tool) {
    const platformKey = `${process.platform}-${process.arch}`;
    const platformBinary = PLATFORM_BINARIES[tool][platformKey];
    if (!platformBinary) {
        throw new Error(`Unsupported ${tool} smoke platform: ${platformKey}`);
    }
    return platformBinary;
}

function copyCompilerPackages(projectRoot) {
    const compilerRoot = join(projectRoot, 'node_modules', '@zenithbuild', 'compiler');
    const platformBinary = currentPlatformBinary('compiler');
    const platformRoot = join(projectRoot, 'node_modules', '@zenithbuild', platformBinary.packageDirName);
    const sourceBinary = resolve(ROOT, platformBinary.packageDir, 'bin', platformBinary.binaryName);

    if (!existsSync(sourceBinary)) {
        throw new Error(`Missing staged compiler platform binary: ${sourceBinary}`);
    }

    mkdirSync(compilerRoot, { recursive: true });
    writeJson(join(compilerRoot, 'package.json'), {
        name: '@zenithbuild/compiler',
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

function copyBundlerPackages(projectRoot) {
    const bundlerRoot = join(projectRoot, 'node_modules', '@zenithbuild', 'bundler');
    const platformBinary = currentPlatformBinary('bundler');
    const platformRoot = join(projectRoot, 'node_modules', '@zenithbuild', platformBinary.packageDirName);
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

    copyCompilerPackages(projectRoot);
    copyBundlerPackages(projectRoot);

    return projectRoot;
}

function expectedCompilerBinaryPattern() {
    const key = `${process.platform}-${process.arch}`;
    switch (key) {
        case 'darwin-arm64':
            return /Mach-O.*arm64/i;
        case 'darwin-x64':
            return /Mach-O.*(x86_64|x86-64)/i;
        case 'linux-x64':
            return /ELF.*(x86_64|x86-64)/i;
        default:
            return null;
    }
}

function assertCompilerBinaryMatchesHost(binaryPath) {
    assert.equal(existsSync(binaryPath), true, `compiler binary missing: ${binaryPath}`);

    if (process.platform === 'win32') {
        const result = spawnSync(binaryPath, ['--version'], { encoding: 'utf8' });
        const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
        assert.equal(result.status, 0, `compiler --version failed:\n${output}`);
        assert.equal(output.length > 0, true, 'compiler --version produced no output');
        return;
    }

    const result = spawnSync('file', [binaryPath], { encoding: 'utf8' });
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    assert.equal(result.status, 0, `file command failed for compiler binary:\n${output}`);
    assert.match(output, expectedCompilerBinaryPattern(), `compiler binary format mismatch:\n${output}`);
}

async function assertToolchainResolution(projectRoot) {
    const { bundlerCommandCandidates, compilerCommandCandidates } = await import(pathToFileURL(CLI_TOOLCHAIN_PATHS).href);
    const compilerCandidates = compilerCommandCandidates(projectRoot, {});
    const bundlerCandidates = bundlerCommandCandidates(projectRoot, {});
    const compilerPlatform = currentPlatformBinary('compiler');
    const bundlerPlatform = currentPlatformBinary('bundler');

    assert.equal(compilerCandidates[0]?.label, 'installed platform package binary');
    assert.equal(bundlerCandidates[0]?.label, 'installed platform package binary');
    assert.equal(
        compilerCandidates[0]?.path.includes(`/node_modules/@zenithbuild/${compilerPlatform.packageDirName}/bin/`),
        true,
        'compiler platform binary did not resolve from fixture'
    );
    assert.equal(
        bundlerCandidates[0]?.path.includes(`/node_modules/@zenithbuild/${bundlerPlatform.packageDirName}/bin/`),
        true,
        'bundler platform binary did not resolve from fixture'
    );

    return {
        compilerBin: compilerCandidates[0]?.path,
        bundlerBin: bundlerCandidates[0]?.path
    };
}

function runSmoke(projectRoot) {
    const result = spawnSync(process.execPath, [CLI_ENTRY, 'build'], {
        cwd: projectRoot,
        env: {
            ...process.env,
            CI: '1',
            ZENITH_NO_UI: '1',
            ZENITH_COMPILER_BIN: '',
            ZENITH_BUNDLER_BIN: ''
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
    assert.equal(
        output.includes('compiler binary incompatible'),
        false,
        `compiler fallback should not trigger in fresh-install smoke:\n${output}`
    );
    assert.equal(output.includes('workspace binary'), false, `workspace fallback leaked into smoke output:\n${output}`);
    assert.equal(output.includes('ENOEXEC'), false, `raw ENOEXEC leaked into output:\n${output}`);
    assert.equal(existsSync(join(projectRoot, 'dist', 'index.html')), true, 'dist/index.html was not generated');
}

const projectRoot = createFixture();

try {
    const { compilerBin } = await assertToolchainResolution(projectRoot);
    assertCompilerBinaryMatchesHost(compilerBin);
    runSmoke(projectRoot);
    console.log('cross-os smoke passed');
} finally {
    rmSync(projectRoot, { recursive: true, force: true });
}
