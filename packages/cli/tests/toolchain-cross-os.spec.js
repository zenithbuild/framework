import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import {
    bundlerCommandCandidates,
    compilerCommandCandidates,
    resolveCompilerBin
} from '../dist/toolchain-paths.js';
import {
    createToolchainStateForTests,
    ensureToolchainCompatibility,
    getActiveToolchainCandidate,
    resetToolchainWarningsForTests,
    runToolchainSync
} from '../dist/toolchain-runner.js';

const COMPILER_BRIDGE_RUNNER = fileURLToPath(new URL('../dist/compiler-bridge-runner.js', import.meta.url));

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

function currentPlatformPackage(tool) {
    const key = `${process.platform}-${process.arch}`;
    const compilerPackages = {
        'darwin-arm64': {
            packageName: '@zenithbuild/compiler-darwin-arm64',
            packageDirName: 'compiler-darwin-arm64',
            binaryName: 'zenith-compiler'
        },
        'darwin-x64': {
            packageName: '@zenithbuild/compiler-darwin-x64',
            packageDirName: 'compiler-darwin-x64',
            binaryName: 'zenith-compiler'
        },
        'linux-x64': {
            packageName: '@zenithbuild/compiler-linux-x64',
            packageDirName: 'compiler-linux-x64',
            binaryName: 'zenith-compiler'
        },
        'win32-x64': {
            packageName: '@zenithbuild/compiler-win32-x64',
            packageDirName: 'compiler-win32-x64',
            binaryName: 'zenith-compiler.exe'
        }
    };
    const bundlerPackages = {
        'darwin-arm64': {
            packageName: '@zenithbuild/bundler-darwin-arm64',
            packageDirName: 'bundler-darwin-arm64',
            binaryName: 'zenith-bundler'
        },
        'darwin-x64': {
            packageName: '@zenithbuild/bundler-darwin-x64',
            packageDirName: 'bundler-darwin-x64',
            binaryName: 'zenith-bundler'
        },
        'linux-x64': {
            packageName: '@zenithbuild/bundler-linux-x64',
            packageDirName: 'bundler-linux-x64',
            binaryName: 'zenith-bundler'
        },
        'win32-x64': {
            packageName: '@zenithbuild/bundler-win32-x64',
            packageDirName: 'bundler-win32-x64',
            binaryName: 'zenith-bundler.exe'
        }
    };
    return tool === 'compiler' ? compilerPackages[key] : bundlerPackages[key];
}

function createCompilerProjectFixture({
    includePlatformPackage = true,
    includeLegacyBinary = true,
    includeBridge = true
} = {}) {
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
        JSON.stringify({ name: '@zenithbuild/compiler', version: '0.0.0-test', type: 'module' }, null, 2),
        'utf8'
    );

    if (includeLegacyBinary) {
        const targetDir = join(compilerRoot, 'target', 'release');
        mkdirSync(targetDir, { recursive: true });
        createExecutableScript(
            targetDir,
            process.platform === 'win32' ? 'zenith-compiler.exe' : 'zenith-compiler',
            'process.stdout.write("{}");'
        );
    }

    if (includeBridge) {
        const distDir = join(compilerRoot, 'dist');
        mkdirSync(distDir, { recursive: true });
        writeFileSync(join(distDir, 'index.js'), 'export function compile() { return {}; }\n', 'utf8');
    }

    if (includePlatformPackage) {
        const platformPackage = currentPlatformPackage('compiler');
        const platformRoot = join(root, 'node_modules', '@zenithbuild', platformPackage.packageDirName);
        mkdirSync(join(platformRoot, 'bin'), { recursive: true });
        writeFileSync(
            join(platformRoot, 'package.json'),
            JSON.stringify({ name: platformPackage.packageName, version: '0.0.0-test', type: 'module' }, null, 2),
            'utf8'
        );
        createExecutableScript(
            join(platformRoot, 'bin'),
            platformPackage.binaryName,
            'process.stdout.write("{}");'
        );
    }

    return root;
}

function createBundlerProjectFixture({
    includePlatformPackage = true,
    includeLegacyBinary = true
} = {}) {
    const root = createTempRoot('zenith-bundler-project-');
    const bundlerRoot = join(root, 'node_modules', '@zenithbuild', 'bundler');
    mkdirSync(join(root, 'node_modules', '@zenithbuild'), { recursive: true });
    writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ name: 'toolchain-bundler-fixture', private: true }, null, 2),
        'utf8'
    );
    mkdirSync(bundlerRoot, { recursive: true });
    writeFileSync(
        join(bundlerRoot, 'package.json'),
        JSON.stringify({ name: '@zenithbuild/bundler', version: '0.0.0-test', type: 'module' }, null, 2),
        'utf8'
    );

    if (includeLegacyBinary) {
        const targetDir = join(bundlerRoot, 'target', 'release');
        mkdirSync(targetDir, { recursive: true });
        createExecutableScript(
            targetDir,
            process.platform === 'win32' ? 'zenith-bundler.exe' : 'zenith-bundler',
            'process.stdout.write("zenith-bundler 0.0.0-test\\n");'
        );
    }

    if (includePlatformPackage) {
        const platformPackage = currentPlatformPackage('bundler');
        const platformRoot = join(root, 'node_modules', '@zenithbuild', platformPackage.packageDirName);
        mkdirSync(join(platformRoot, 'bin'), { recursive: true });
        writeFileSync(
            join(platformRoot, 'package.json'),
            JSON.stringify({ name: platformPackage.packageName, version: '0.0.0-test', type: 'module' }, null, 2),
            'utf8'
        );
        createExecutableScript(
            join(platformRoot, 'bin'),
            platformPackage.binaryName,
            'process.stdout.write("zenith-bundler 0.0.0-test\\n");'
        );
    }

    return root;
}

describe('toolchain cross-OS fallback', () => {
    afterEach(() => {
        resetToolchainWarningsForTests();
        jest.restoreAllMocks();
    });

    test('compiler candidate ordering keeps env override first, platform before legacy, and JS bridge last', () => {
        const projectRoot = createCompilerProjectFixture();
        const envOverride = join(projectRoot, 'custom-compiler-bin');
        writeFileSync(envOverride, '', 'utf8');

        try {
            const candidates = compilerCommandCandidates(projectRoot, {
                ZENITH_COMPILER_BIN: envOverride
            });

            expect(candidates[0].label).toBe('env override (ZENITH_COMPILER_BIN)');
            expect(candidates[1].label).toBe('installed platform package binary');
            expect(candidates[2].label).toBe('legacy installed package binary');
            expect(candidates[candidates.length - 1].label).toBe('JS bridge');
            expect(candidates.slice(3, -1).every((candidate) => candidate.label === 'workspace binary')).toBe(true);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('compiler resolves the platform package path even when the legacy binary is absent', () => {
        const projectRoot = createCompilerProjectFixture({
            includePlatformPackage: true,
            includeLegacyBinary: false,
            includeBridge: false
        });
        const platformPackage = currentPlatformPackage('compiler');

        try {
            expect(resolveCompilerBin(projectRoot)).toContain(
                `/node_modules/@zenithbuild/${platformPackage.packageDirName}/bin/${platformPackage.binaryName}`
            );
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('compiler env override wins over platform and legacy installs', () => {
        const projectRoot = createCompilerProjectFixture();
        const envOverride = createExecutableScript(projectRoot, 'env-compiler.js', 'process.stdout.write("{}");');

        try {
            expect(resolveCompilerBin(projectRoot, { ZENITH_COMPILER_BIN: envOverride })).toBe(envOverride);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('resolution order prefers env override, then platform, then legacy, then workspace, then JS bridge', () => {
        const root = createTempRoot('zenith-toolchain-order-');
        const envPath = createExecutableScript(root, 'env-compiler.js', 'process.stdout.write("{}");');
        const platformPath = createExecutableScript(root, 'platform-compiler.js', 'process.stdout.write("{}");');
        const legacyPath = createExecutableScript(root, 'legacy-compiler.js', 'process.stdout.write("{}");');
        const workspacePath = createExecutableScript(root, 'workspace-compiler.js', 'process.stdout.write("{}");');
        const bridgePath = createCompilerBridgeModule(root);

        try {
            const candidates = [
                makeBinaryCandidate('compiler', 'env override (ZENITH_COMPILER_BIN)', envPath, process.execPath, [envPath]),
                makeBinaryCandidate('compiler', 'installed platform package binary', platformPath, process.execPath, [platformPath]),
                makeBinaryCandidate('compiler', 'legacy installed package binary', legacyPath, process.execPath, [legacyPath]),
                makeBinaryCandidate('compiler', 'workspace binary', workspacePath, process.execPath, [workspacePath]),
                makeBridgeCandidate(bridgePath)
            ];

            expect(getActiveToolchainCandidate(createToolchainStateForTests('compiler', candidates)).label)
                .toBe('env override (ZENITH_COMPILER_BIN)');
            expect(getActiveToolchainCandidate(createToolchainStateForTests('compiler', candidates.slice(1))).label)
                .toBe('installed platform package binary');
            expect(getActiveToolchainCandidate(createToolchainStateForTests('compiler', candidates.slice(2))).label)
                .toBe('legacy installed package binary');
            expect(getActiveToolchainCandidate(createToolchainStateForTests('compiler', candidates.slice(3))).label)
                .toBe('workspace binary');
            expect(getActiveToolchainCandidate(createToolchainStateForTests('compiler', candidates.slice(4))).label)
                .toBe('JS bridge');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('compiler falls back to the legacy binary when the platform package is incompatible', () => {
        const root = createTempRoot('zenith-toolchain-fallback-');
        const sourceFile = join(root, 'page.zen');
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const legacyPath = createExecutableScript(root, 'legacy-compiler.js', 'process.stdout.write("{}");');

        writeFileSync(sourceFile, '<div />\n', 'utf8');

        try {
            const toolchain = createToolchainStateForTests('compiler', [
                createIncompatibleCandidate(root, 'compiler', 'installed platform package binary'),
                makeBinaryCandidate('compiler', 'legacy installed package binary', legacyPath, process.execPath, [legacyPath])
            ]);
            const { candidate } = runToolchainSync(toolchain, [sourceFile], { encoding: 'utf8' });

            expect(candidate.label).toBe('legacy installed package binary');
            expect(warnSpy).toHaveBeenCalledWith(
                '[zenith] compiler binary incompatible for this platform; falling back to legacy installed package binary'
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('compiler falls back to JS bridge when no compatible native binary exists', () => {
        const root = createTempRoot('zenith-toolchain-bridge-');
        const sourceFile = join(root, 'page.zen');
        const bridgeModule = createCompilerBridgeModule(root);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        writeFileSync(sourceFile, '<div />\n', 'utf8');

        try {
            const toolchain = createToolchainStateForTests('compiler', [
                createIncompatibleCandidate(root, 'compiler', 'installed platform package binary'),
                createIncompatibleCandidate(root, 'compiler', 'legacy installed package binary'),
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

    test('bundler preflight falls back to env override when the installed platform binary is incompatible', () => {
        const root = createTempRoot('zenith-bundler-fallback-');
        const incompatible = createIncompatibleCandidate(root, 'bundler', 'installed platform package binary');
        const overridePath = createExecutableScript(root, 'bundler-override.js', 'process.stdout.write("zenith-bundler 0.0.0-test\\n");');
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

    test('bundler candidate ordering prefers the installed platform package before legacy and workspace fallbacks', () => {
        const projectRoot = createBundlerProjectFixture();

        try {
            const candidates = bundlerCommandCandidates(projectRoot, {});

            expect(candidates[0].label).toBe('installed platform package binary');
            expect(candidates[1].label).toBe('legacy installed package binary');
            expect(candidates.slice(2).every((candidate) => candidate.label === 'workspace binary')).toBe(true);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('bundler throws a deterministic missing-install error when no platform binary is installed', () => {
        const projectRoot = createBundlerProjectFixture({
            includePlatformPackage: false,
            includeLegacyBinary: false
        });

        try {
            const candidates = bundlerCommandCandidates(projectRoot, {}).filter(
                (candidate) => candidate.label !== 'workspace binary'
            );
            const toolchain = createToolchainStateForTests('bundler', candidates);

            expect(() => ensureToolchainCompatibility(toolchain)).toThrow(
                `[zenith] Bundler binary not installed for ${process.platform}/${process.arch}. ` +
                'Reinstall @zenithbuild/bundler and ensure the matching platform package is installed. ' +
                'See https://github.com/zenithbuild/framework/blob/master/docs/documentation/install-compatibility.md.'
            );
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('throws a deterministic compiler error when no fallback exists', () => {
        const root = createTempRoot('zenith-toolchain-error-');
        const sourceFile = join(root, 'page.zen');
        writeFileSync(sourceFile, '<div />\n', 'utf8');

        try {
            const toolchain = createToolchainStateForTests('compiler', [
                createIncompatibleCandidate(root, 'compiler', 'installed platform package binary')
            ]);

            expect(() => runToolchainSync(toolchain, [sourceFile], { encoding: 'utf8' })).toThrow(
                `[zenith] compiler binary is incompatible for ${process.platform}-${process.arch}; ` +
                'reinstall, clear the wrong-platform package, or set ZENITH_COMPILER_BIN=... ' +
                'See https://github.com/zenithbuild/framework/blob/master/docs/documentation/install-compatibility.md.'
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
