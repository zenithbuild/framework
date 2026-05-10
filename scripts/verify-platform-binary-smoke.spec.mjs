import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    platformBinaryName,
    resolvePlatformBinaryPath,
    verifyPlatformBinarySmoke
} from './verify-platform-binary-smoke.mjs';

test('platform binary names include Windows .exe suffixes', () => {
    assert.equal(platformBinaryName('compiler', 'win32-x64'), 'zenith-compiler.exe');
    assert.equal(platformBinaryName('bundler', 'win32-x64'), 'zenith-bundler.exe');
    assert.equal(platformBinaryName('compiler', 'linux-x64'), 'zenith-compiler');
    assert.equal(platformBinaryName('bundler', 'darwin-arm64'), 'zenith-bundler');
});

test('platform binary path resolves through package dir and platform key', () => {
    assert.equal(
        resolvePlatformBinaryPath({
            packageKind: 'compiler',
            packageDir: 'packages/compiler-win32-x64',
            platformKey: 'win32-x64'
        }),
        resolve('packages/compiler-win32-x64/bin/zenith-compiler.exe')
    );
});

test('publish validation fails when compiler smoke fails', () => {
    const calls = [];

    assert.throws(
        () => verifyPlatformBinarySmoke({
            packageKind: 'compiler',
            binaryPath: '/fake/zenith-compiler',
            exists: () => true,
            spawn(command, args, options) {
                calls.push({ command, args, input: options.input || '' });
                if (args.includes('--version')) {
                    return { status: 0, stdout: '0.0.0\n', stderr: '' };
                }
                return { status: 9, stdout: '', stderr: 'smoke failed' };
            }
        }),
        /compiler stdin smoke failed/
    );

    assert.deepEqual(calls.map((call) => call.args), [['--version'], ['--stdin', 'smoke.zen']]);
});

test('publish validation fails when bundler smoke fails', () => {
    let smokeInput = '';

    assert.throws(
        () => verifyPlatformBinarySmoke({
            packageKind: 'bundler',
            binaryPath: '/fake/zenith-bundler',
            exists: () => true,
            makeTempDir: () => '/tmp/zenith-bundler-smoke',
            removeDir: () => {},
            spawn(_command, args, options) {
                if (args.includes('--version')) {
                    return { status: 0, stdout: '0.0.0\n', stderr: '' };
                }
                smokeInput = String(options.input || '');
                return { status: 4, stdout: '', stderr: 'payload failed' };
            }
        }),
        /bundler payload smoke failed/
    );

    assert.equal(JSON.parse(smokeInput)[0].route, '/');
});

test('publish workflow does not mask required native smoke commands', () => {
    const workflow = readFileSync('.github/workflows/publish.yml', 'utf8');
    assert.doesNotMatch(workflow, /\|\|\s*true/);
    assert.match(workflow, /node scripts\/verify-platform-binary-smoke\.mjs/);
});
