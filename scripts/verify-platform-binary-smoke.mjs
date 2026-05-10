#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUNDLER_SMOKE_PAYLOAD = [{
    route: '/',
    file: 'pages/index.zen',
    router: false,
    ir: {
        ir_version: 1,
        graph_hash: 'b33c44aff8d0a0fffce5f2b62462266d0a7266029c56af86f645e3670438de60',
        graph_nodes: [{ id: 'mod', hoist_id: 'mod' }],
        graph_edges: [],
        html: '<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><h1>smoke</h1></body></html>',
        expressions: [],
        marker_bindings: [],
        event_bindings: [],
        signals: [],
        expression_bindings: [],
        style_blocks: [],
        hoisted: { code: [], state: [] },
        components_scripts: {},
        component_instances: [],
        imports: [],
        modules: [],
        prerender: false
    }
}];

function readArg(args, name) {
    const index = args.indexOf(name);
    if (index === -1) {
        return '';
    }
    return args[index + 1] || '';
}

export function platformBinaryName(packageKind, platformKey) {
    if (packageKind !== 'bundler' && packageKind !== 'compiler') {
        throw new Error(`Unsupported package kind: ${packageKind || '(empty)'}`);
    }
    const baseName = packageKind === 'bundler' ? 'zenith-bundler' : 'zenith-compiler';
    return String(platformKey || '').startsWith('win32') ? `${baseName}.exe` : baseName;
}

function formatFailure(label, result) {
    const stdout = String(result.stdout || '').trim();
    const stderr = String(result.stderr || '').trim();
    const error = result.error instanceof Error ? result.error.message : '';
    return [
        `${label} failed with exit ${result.status ?? 'unknown'}`,
        error ? `error:\n${error}` : '',
        `stdout:\n${stdout}`,
        `stderr:\n${stderr}`
    ].filter(Boolean).join('\n');
}

function runRequired(spawn, label, command, args, options = {}) {
    const result = spawn(command, args, {
        encoding: 'utf8',
        ...options
    });
    if (result.error || result.status !== 0) {
        throw new Error(formatFailure(label, result));
    }
    return result;
}

export function resolvePlatformBinaryPath({ packageKind, packageDir, platformKey, binaryPath = '' }) {
    if (binaryPath) {
        return binaryPath;
    }
    if (!packageDir) {
        throw new Error('PACKAGE_DIR or --package-dir is required when --binary is not provided.');
    }
    return resolve(packageDir, 'bin', platformBinaryName(packageKind, platformKey));
}

export function verifyPlatformBinarySmoke({
    packageKind,
    packageDir = '',
    platformKey = `${process.platform}-${process.arch}`,
    binaryPath = '',
    spawn = spawnSync,
    exists = existsSync,
    makeTempDir = (prefix) => mkdtempSync(join(tmpdir(), prefix)),
    removeDir = (dir) => rmSync(dir, { recursive: true, force: true })
}) {
    const binary = resolvePlatformBinaryPath({ packageKind, packageDir, platformKey, binaryPath });
    if (!exists(binary)) {
        throw new Error(`Platform binary not found: ${binary}`);
    }

    runRequired(spawn, `${packageKind} --version`, binary, ['--version']);

    if (packageKind === 'compiler') {
        runRequired(spawn, 'compiler stdin smoke', binary, ['--stdin', 'smoke.zen'], {
            input: '<div>smoke</div>'
        });
        return { binary, packageKind };
    }

    const smokeDir = makeTempDir('zenith-bundler-platform-smoke-');
    try {
        runRequired(spawn, 'bundler payload smoke', binary, ['--out-dir', join(smokeDir, 'out')], {
            input: JSON.stringify(BUNDLER_SMOKE_PAYLOAD)
        });
    } finally {
        removeDir(smokeDir);
    }
    return { binary, packageKind };
}

export function main(args = process.argv.slice(2), env = process.env) {
    const packageKind = readArg(args, '--kind') || env.PACKAGE_KIND;
    const packageDir = readArg(args, '--package-dir') || env.PACKAGE_DIR || '';
    const platformKey = readArg(args, '--platform-key') || env.PLATFORM_KEY || `${process.platform}-${process.arch}`;
    const binaryPath = readArg(args, '--binary') || env.PLATFORM_BINARY || '';
    const result = verifyPlatformBinarySmoke({ packageKind, packageDir, platformKey, binaryPath });
    console.log(`✓ ${result.packageKind} platform binary smoke passed: ${result.binary}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    try {
        main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
