#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const CLI_ENTRY = resolve(ROOT, 'packages/cli/src/index.js');

function writeJson(filePath, value) {
    writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture() {
    const projectRoot = mkdtempSync(join(tmpdir(), 'zenith-cross-os-smoke-'));

    mkdirSync(join(projectRoot, 'src', 'pages'), { recursive: true });
    mkdirSync(join(projectRoot, 'node_modules', '@zenithbuild', 'compiler', 'target', 'release'), {
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

    writeJson(join(projectRoot, 'node_modules', '@zenithbuild', 'compiler', 'package.json'), {
        name: '@zenithbuild/compiler',
        version: '0.0.0-smoke'
    });

    if (process.platform === 'win32') {
        writeFileSync(
            join(projectRoot, 'node_modules', '@zenithbuild', 'compiler', 'target', 'release', 'zenith-compiler.exe'),
            'not a real windows executable\n'
        );
    } else {
        const fakeBinaryPath = join(
            projectRoot,
            'node_modules',
            '@zenithbuild',
            'compiler',
            'target',
            'release',
            'zenith-compiler'
        );
        writeFileSync(
            fakeBinaryPath,
            '#!/usr/bin/env sh\n' +
            'echo "bad CPU type" >&2\n' +
            'exit 1\n'
        );
        chmodSync(fakeBinaryPath, 0o755);
    }

    return projectRoot;
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
    assert.match(
        output,
        /\[zenith\] compiler binary incompatible for this platform; falling back to workspace binary/,
        `expected compiler fallback warning in output:\n${output}`
    );
    assert.equal(output.includes('ENOEXEC'), false, `raw ENOEXEC leaked into output:\n${output}`);
    assert.equal(existsSync(join(projectRoot, 'dist', 'index.html')), true, 'dist/index.html was not generated');
}

const projectRoot = createFixture();

try {
    runSmoke(projectRoot);
    console.log('cross-os smoke passed');
} finally {
    rmSync(projectRoot, { recursive: true, force: true });
}
