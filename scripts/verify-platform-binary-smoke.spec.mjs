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

test('publish workflow prepares bundler template dependencies before platform smoke', () => {
    const workflow = readFileSync('.github/workflows/publish.yml', 'utf8');
    const setupIndex = workflow.indexOf('oven-sh/setup-bun@v2');
    const buildIndex = workflow.indexOf('Build JS template dependencies for bundler smoke');
    const smokeIndex = workflow.indexOf('Verify platform binary exists and works');

    assert.ok(setupIndex !== -1, 'bundler platform smoke should install Bun');
    assert.ok(buildIndex !== -1, 'bundler platform smoke should build JS template dependencies');
    assert.ok(smokeIndex !== -1, 'platform smoke step should exist');
    assert.ok(setupIndex < smokeIndex, 'Bun setup should run before platform smoke');
    assert.ok(buildIndex < smokeIndex, 'template dependencies should build before platform smoke');

    const dependencyBuildBlock = workflow.slice(buildIndex, smokeIndex);
    assert.match(dependencyBuildBlock, /if:\s*matrix\.package_kind == 'bundler'/);
    assert.match(dependencyBuildBlock, /bun install/);
    assert.match(dependencyBuildBlock, /bun run --cwd packages\/runtime build/);
    assert.match(dependencyBuildBlock, /bun run --cwd packages\/router build/);
});

test('publish workflow gives linux bundler container smoke access to template bridge packages', () => {
    const workflow = readFileSync('.github/workflows/publish.yml', 'utf8');
    const bundlerContainerMounts = [...workflow.matchAll(/docker_mounts=\(\n\s+-v "\$\(pwd\):\/repo:ro"\n\s+-v "\$\(pwd\)\/\$\{PACKAGE_DIR\}\/bin:\/test-bin:ro"\n\s+-w \/repo\/packages\/bundler\n\s+\)/g)];

    assert.equal(
        bundlerContainerMounts.length,
        2,
        'glibc and musl linux container smokes should mount the repo for bundler template dependencies'
    );
    assert.match(workflow, /node:20-slim[\s\S]*node \/repo\/scripts\/verify-platform-binary-smoke\.mjs/);
    assert.match(workflow, /node:20-alpine[\s\S]*node \/repo\/scripts\/verify-platform-binary-smoke\.mjs/);
});

test('publish workflow can recover an existing release tag without moving it', () => {
    const workflow = readFileSync('.github/workflows/publish.yml', 'utf8');
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /release_tag:/);
    assert.match(workflow, /git fetch --force origin "refs\/tags\/\$\{TAG_NAME\}:refs\/tags\/\$\{TAG_NAME\}"/);
    assert.match(workflow, /release_sha="\$\(git rev-parse "\$\{TAG_NAME\}\^\{commit\}"\)"/);
    assert.match(workflow, /GITHUB_SHA:\s*\$\{\{ steps\.release_version\.outputs\.release_sha \}\}/);
    assert.match(workflow, /RELEASE_SHA:\s*\$\{\{ needs\.preflight\.outputs\.release_sha \}\}/);
});
