import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZenithLogger } from '../dist/ui/logger.js';
import {
    checkCompatibility,
    getBundlerVersion,
    getLocalZenithVersions,
    maybeWarnAboutZenithVersionMismatch
} from '../dist/version-check.js';
import { readCliPackageVersion } from '../dist/toolchain-paths.js';

const CLI_ENTRY = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const CLI_VERSION = readCliPackageVersion();

function createRuntime(env = {}) {
    const stdout = [];
    const stderr = [];
    return {
        env: {
            CI: '1',
            NO_COLOR: '1',
            ...env
        },
        stdout: {
            isTTY: false,
            write(value) {
                stdout.push(String(value));
            }
        },
        stderr: {
            isTTY: false,
            write(value) {
                stderr.push(String(value));
            }
        },
        output() {
            return {
                stdout: stdout.join('').replace(/\r/g, ''),
                stderr: stderr.join('').replace(/\r/g, '')
            };
        }
    };
}

function createFakeProject(versionMap) {
    const root = mkdtempSync(join(tmpdir(), 'zenith-version-check-'));
    mkdirSync(join(root, 'src', 'pages'), { recursive: true });
    mkdirSync(join(root, 'node_modules', '@zenithbuild'), { recursive: true });
    writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
            name: 'version-check-fixture',
            private: true,
            devDependencies: Object.fromEntries(
                Object.keys(versionMap).map((key) => [`@zenithbuild/${key}`, versionMap[key]])
            )
        }, null, 2),
        'utf8'
    );

    for (const [name, version] of Object.entries(versionMap)) {
        const packageRoot = join(root, 'node_modules', '@zenithbuild', name);
        mkdirSync(packageRoot, { recursive: true });
        writeFileSync(
            join(packageRoot, 'package.json'),
            JSON.stringify({
                name: `@zenithbuild/${name}`,
                version,
                main: './index.js'
            }, null, 2),
            'utf8'
        );
        writeFileSync(join(packageRoot, 'index.js'), 'export default {};\n', 'utf8');
    }

    return root;
}

function createBundlerStub(version) {
    const root = mkdtempSync(join(tmpdir(), 'zenith-bundler-stub-'));
    const stubPath = join(root, 'zenith-bundler');
    writeFileSync(
        stubPath,
        `#!/usr/bin/env node\nprocess.stdout.write("zenith-bundler ${version}\\n");\n`,
        'utf8'
    );
    chmodSync(stubPath, 0o755);
    return { root, stubPath };
}

describe('zenith version check', () => {
    test('returns ok for an aligned toolchain', () => {
        const result = checkCompatibility({
            projectRoot: '/tmp/app',
            cli: '0.6.4',
            projectCli: '0.6.4',
            core: '0.6.4',
            compiler: '0.6.4',
            runtime: '0.6.4',
            router: '0.6.4',
            bundlerPackage: '0.6.4',
            bundlerBinary: '0.6.4',
            targetVersion: '0.6.4'
        });

        expect(result.status).toBe('ok');
        expect(result.issues).toEqual([]);
    });

    test('warns on mismatched beta trains', () => {
        const result = checkCompatibility({
            projectRoot: '/tmp/app',
            cli: '0.6.4-beta.2.17',
            projectCli: '0.6.4-beta.2.17',
            core: '0.6.4-beta.2.17',
            compiler: '0.6.4-beta.3.1',
            runtime: '0.6.4-beta.2.17',
            router: '0.6.4-beta.2.17',
            bundlerPackage: '0.6.4-beta.2.17',
            bundlerBinary: '0.6.4-beta.2.17',
            targetVersion: '0.6.4-beta.2.17'
        });

        expect(result.status).toBe('warn');
        expect(result.issues.some((issue) => issue.code === 'VERSION_TRAIN_MISMATCH')).toBe(true);
    });

    test('parses bundler --version output', () => {
        const bundler = createBundlerStub('0.6.4');
        try {
            const version = getBundlerVersion(bundler.stubPath);
            expect(version.ok).toBe(true);
            expect(version.version).toBe('0.6.4');
        } finally {
            rmSync(bundler.root, { recursive: true, force: true });
        }
    });

    test('prefers workspace package versions when explicitly requested', () => {
        const projectRoot = createFakeProject({
            core: '0.6.17',
            cli: '0.6.17',
            compiler: '0.6.17',
            runtime: '0.6.17',
            router: '0.6.17',
            bundler: '0.6.17'
        });

        try {
            const versions = getLocalZenithVersions({
                projectRoot,
                preferWorkspacePackageVersions: true
            });

            expect(versions.projectCli).toBe(CLI_VERSION);
            expect(versions.core).toBe(CLI_VERSION);
            expect(versions.compiler).toBe(CLI_VERSION);
            expect(versions.runtime).toBe(CLI_VERSION);
            expect(versions.router).toBe(CLI_VERSION);
            expect(versions.bundlerPackage).toBe(CLI_VERSION);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('prints mismatch warning once per session with a fix command', async () => {
        const runtime = createRuntime();
        const logger = createZenithLogger(runtime);
        const projectRoot = createFakeProject({
            core: CLI_VERSION,
            cli: CLI_VERSION,
            compiler: CLI_VERSION,
            runtime: '0.6.3',
            router: CLI_VERSION,
            bundler: CLI_VERSION
        });
        const bundler = createBundlerStub('0.6.2');

        try {
            await maybeWarnAboutZenithVersionMismatch({
                projectRoot,
                logger,
                command: 'dev',
                bundlerBinPath: bundler.stubPath
            });
            await maybeWarnAboutZenithVersionMismatch({
                projectRoot,
                logger,
                command: 'dev',
                bundlerBinPath: bundler.stubPath
            });

            const { stderr } = runtime.output();
            expect(stderr.match(/Version mismatch detected/g) || []).toHaveLength(1);
            expect(stderr).toContain('npm i');
            expect(stderr).toContain('ZENITH_SKIP_VERSION_CHECK=1');
            expect(stderr).toContain(`bundler bin 0.6.2 != ${CLI_VERSION}`);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
            rmSync(bundler.root, { recursive: true, force: true });
        }
    });

    test('runs the check from the real build command path', () => {
        const projectRoot = createFakeProject({
            core: CLI_VERSION,
            cli: CLI_VERSION,
            compiler: CLI_VERSION,
            runtime: '0.6.3',
            router: CLI_VERSION,
            bundler: CLI_VERSION
        });
        const bundler = createBundlerStub('0.6.2');

        try {
            const result = spawnSync(process.execPath, [CLI_ENTRY, 'build'], {
                cwd: projectRoot,
                encoding: 'utf8',
                env: {
                    ...process.env,
                    CI: '1',
                    NO_COLOR: '1',
                    ZENITH_BUNDLER_BIN: bundler.stubPath
                }
            });

            expect(result.status).toBe(0);
            expect(`${result.stdout}${result.stderr}`).toContain('Version mismatch detected');
            expect(`${result.stdout}${result.stderr}`).toContain('npm i');
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
            rmSync(bundler.root, { recursive: true, force: true });
        }
    });
});
