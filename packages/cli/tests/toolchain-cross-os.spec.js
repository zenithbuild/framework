import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { compilerCommandCandidates } from '../src/toolchain-paths.js';
import {
    createToolchainStateForTests,
    ensureToolchainCompatibility,
    getActiveToolchainCandidate,
    resetToolchainWarningsForTests,
    runToolchainSync
} from '../src/toolchain-runner.js';

const COMPILER_BRIDGE_RUNNER = fileURLToPath(new URL('../src/compiler-bridge-runner.js', import.meta.url));

function makeBinaryCandidate(tool, label, candidatePath, command = candidatePath, argsPrefix = []) {
    return {
        tool,
        mode: 'binary',
        source: label,
        sourceKey: `${tool}:${label}:${candidatePath}`,
        label,
        path: candidatePath,
        command,
        argsPrefix
    };
}

function makeBridgeCandidate(modulePath) {
    return {
        tool: 'compiler',
        mode: 'node-bridge',
        source: 'JS bridge',
        sourceKey: `compiler:bridge:${modulePath}`,
        label: 'JS bridge',
        path: modulePath,
        command: process.execPath,
        argsPrefix: [COMPILER_BRIDGE_RUNNER, '--bridge-module', modulePath]
    };
}

function createTempRoot(prefix) {
    return mkdtempSync(join(tmpdir(), prefix));
}

function createExecutableScript(root, name, body) {
    const filePath = join(root, name);
    writeFileSync(filePath, `#!/usr/bin/env node\n${body}\n`, 'utf8');
    chmodSync(filePath, 0o755);
    return filePath;
}

function createIncompatibleCandidate(root, tool, label) {
    if (process.platform === 'win32') {
        const scriptPath = createExecutableScript(
            root,
            `${tool}-incompatible.js`,
            'process.stderr.write("bad CPU type\\n"); process.exit(1);'
        );
        return makeBinaryCandidate(tool, label, scriptPath, process.execPath, [scriptPath]);
    }

    const filePath = join(root, `${tool}-incompatible`);
    writeFileSync(
        filePath,
        '#!/usr/bin/env sh\n' +
        'echo "bad CPU type" >&2\n' +
        'exit 1\n',
        'utf8'
    );
    chmodSync(filePath, 0o755);
    return makeBinaryCandidate(tool, label, filePath);
}

function createCompilerBridgeModule(root) {
    const modulePath = join(root, 'compiler-bridge.js');
    writeFileSync(
        modulePath,
        [
            'export async function compile(input) {',
            '  const filePath = typeof input === "string" ? input : input.filePath;',
            '  return { ok: true, via: "bridge", filePath };',
            '}'
        ].join('\n'),
        'utf8'
    );
    return modulePath;
}

function createCompilerProjectFixture({ includeInstalledBinary = true, includeBridge = true } = {}) {
    const root = createTempRoot('zenith-toolchain-project-');
    const compilerRoot = join(root, 'node_modules', '@zenithbuild', 'compiler');
    mkdirSync(join(root, 'node_modules', '@zenithbuild'), { recursive: true });
    writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ name: 'toolchain-fixture', private: true }, null, 2),
        'utf8'
    );
    mkdirSync(compilerRoot, { recursive: true });
    writeFileSync(
        join(compilerRoot, 'package.json'),
        JSON.stringify({ name: '@zenithbuild/compiler', version: '0.6.6', type: 'module' }, null, 2),
        'utf8'
    );

    if (includeInstalledBinary) {
        const targetDir = join(compilerRoot, 'target', 'release');
        mkdirSync(targetDir, { recursive: true });
        createExecutableScript(targetDir, process.platform === 'win32' ? 'zenith-compiler.exe' : 'zenith-compiler', 'process.stdout.write("{}");');
    }

    if (includeBridge) {
        const distDir = join(compilerRoot, 'dist');
        mkdirSync(distDir, { recursive: true });
        writeFileSync(join(distDir, 'index.js'), 'export function compile() { return {}; }\n', 'utf8');
    }

    return root;
}

describe('toolchain cross-OS fallback', () => {
    afterEach(() => {
        resetToolchainWarningsForTests();
        jest.restoreAllMocks();
    });

    test('compiler candidate ordering keeps env override first and JS bridge last', () => {
        const projectRoot = createCompilerProjectFixture();
        const envOverride = join(projectRoot, 'custom-compiler-bin');
        writeFileSync(envOverride, '', 'utf8');

        try {
            const candidates = compilerCommandCandidates(projectRoot, {
                ZENITH_COMPILER_BIN: envOverride
            });

            expect(candidates[0].label).toBe('env override (ZENITH_COMPILER_BIN)');
            expect(candidates[1].label).toBe('installed package binary');
            expect(candidates[candidates.length - 1].label).toBe('JS bridge');
            expect(candidates.slice(2, -1).every((candidate) => candidate.label === 'workspace binary')).toBe(true);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('resolution order prefers env override, then installed, then workspace, then JS bridge', () => {
        const root = createTempRoot('zenith-toolchain-order-');
        const envPath = createExecutableScript(root, 'env-compiler.js', 'process.stdout.write("{}");');
        const installedPath = createExecutableScript(root, 'installed-compiler.js', 'process.stdout.write("{}");');
        const workspacePath = createExecutableScript(root, 'workspace-compiler.js', 'process.stdout.write("{}");');
        const bridgePath = createCompilerBridgeModule(root);

        try {
            const candidates = [
                makeBinaryCandidate('compiler', 'env override (ZENITH_COMPILER_BIN)', envPath, process.execPath, [envPath]),
                makeBinaryCandidate('compiler', 'installed package binary', installedPath, process.execPath, [installedPath]),
                makeBinaryCandidate('compiler', 'workspace binary', workspacePath, process.execPath, [workspacePath]),
                makeBridgeCandidate(bridgePath)
            ];

            expect(getActiveToolchainCandidate(createToolchainStateForTests('compiler', candidates)).label)
                .toBe('env override (ZENITH_COMPILER_BIN)');
            expect(getActiveToolchainCandidate(createToolchainStateForTests('compiler', candidates.slice(1))).label)
                .toBe('installed package binary');
            expect(getActiveToolchainCandidate(createToolchainStateForTests('compiler', candidates.slice(2))).label)
                .toBe('workspace binary');
            expect(getActiveToolchainCandidate(createToolchainStateForTests('compiler', candidates.slice(3))).label)
                .toBe('JS bridge');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('compiler falls back to JS bridge when the binary is incompatible', () => {
        const root = createTempRoot('zenith-toolchain-fallback-');
        const sourceFile = join(root, 'page.zen');
        const incompatible = createIncompatibleCandidate(root, 'compiler', 'installed package binary');
        const bridgeModule = createCompilerBridgeModule(root);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        writeFileSync(sourceFile, '<div />\n', 'utf8');

        try {
            const toolchain = createToolchainStateForTests('compiler', [
                incompatible,
                makeBridgeCandidate(bridgeModule)
            ]);
            const { result, candidate } = runToolchainSync(toolchain, [sourceFile], { encoding: 'utf8' });

            expect(candidate.label).toBe('JS bridge');
            expect(JSON.parse(result.stdout)).toEqual({
                ok: true,
                via: 'bridge',
                filePath: sourceFile
            });
            expect(warnSpy).toHaveBeenCalledWith(
                '[zenith] compiler binary incompatible for this platform; falling back to JS bridge'
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('bundler preflight falls back to env override when the installed binary is incompatible', () => {
        const root = createTempRoot('zenith-bundler-fallback-');
        const incompatible = createIncompatibleCandidate(root, 'bundler', 'installed package binary');
        const overridePath = createExecutableScript(root, 'bundler-override.js', 'process.stdout.write("zenith-bundler 0.6.6\\n");');
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        try {
            const toolchain = createToolchainStateForTests('bundler', [
                incompatible,
                makeBinaryCandidate('bundler', 'env override (ZENITH_BUNDLER_BIN)', overridePath, process.execPath, [overridePath])
            ]);

            ensureToolchainCompatibility(toolchain);

            expect(getActiveToolchainCandidate(toolchain).label).toBe('env override (ZENITH_BUNDLER_BIN)');
            expect(warnSpy).toHaveBeenCalledWith(
                '[zenith] bundler binary incompatible for this platform; falling back to env override (ZENITH_BUNDLER_BIN)'
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('throws a deterministic compiler error when no fallback exists', () => {
        const root = createTempRoot('zenith-toolchain-error-');
        const sourceFile = join(root, 'page.zen');
        writeFileSync(sourceFile, '<div />\n', 'utf8');

        try {
            const toolchain = createToolchainStateForTests('compiler', [
                createIncompatibleCandidate(root, 'compiler', 'installed package binary')
            ]);

            expect(() => runToolchainSync(toolchain, [sourceFile], { encoding: 'utf8' })).toThrow(
                `[zenith] compiler binary is incompatible for ${process.platform}-${process.arch}; reinstall or set ZENITH_COMPILER_BIN=...`
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
