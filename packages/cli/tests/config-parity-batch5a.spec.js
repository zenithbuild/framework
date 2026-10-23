import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, validateConfig as validateCliConfig } from '../dist/config.js';
import { KNOWN_TARGETS as CLI_TARGETS } from '../dist/adapters/adapter-types.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const UNKNOWN_KEYS = ['softNavigation', 'types', 'assetPrefix', 'devTrace'];

describe('Batch 5A config parity', () => {
    let CORE_TARGETS;
    let getCoreDefaults;
    let validateCoreConfig;

    beforeAll(async () => {
        const result = spawnSync('npm', ['run', '--prefix', 'packages/core', 'build'], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            stdio: 'pipe'
        });

        if (result.status !== 0) {
            throw new Error([
                'Failed to build packages/core before config parity assertions.',
                result.stdout,
                result.stderr
            ].filter(Boolean).join('\n'));
        }

        ({ ZENITH_TARGETS: CORE_TARGETS } = await import('../../core/dist/config-targets.js'));
        ({ getDefaults: getCoreDefaults, validateConfig: validateCoreConfig } = await import('../../core/dist/config.js'));
    });

    test('core and CLI supported target lists stay in parity', () => {
        expect([...CORE_TARGETS].sort()).toEqual([...CLI_TARGETS].sort());

        for (const target of CORE_TARGETS) {
            expect(validateCoreConfig({ target }).target).toBe(target);
            expect(validateCliConfig({ target }).target).toBe(target);
        }
    });

    test('core and CLI top-level default config keys stay in parity', () => {
        expect(Object.keys(getCoreDefaults()).sort()).toEqual(Object.keys(DEFAULT_CONFIG).sort());
    });

    test('core and CLI accept the minimal plugin config surface', () => {
        const plugin = { name: 'auth' };

        expect(validateCoreConfig({ plugins: [plugin] }).plugins).toEqual([{ name: 'auth' }]);
        expect(validateCliConfig({ plugins: [plugin] }).plugins).toEqual([{ name: 'auth' }]);
    });

    test('core and CLI reject removed or config-like unknown keys', () => {
        for (const key of UNKNOWN_KEYS) {
            expect(() => validateCoreConfig({ [key]: true })).toThrow(`[Zenith:Config] Unknown key: "${key}"`);
            expect(() => validateCliConfig({ [key]: true })).toThrow(`[Zenith:Config] Unknown key: "${key}"`);
        }
    });

    test('dev tracing stays environment-driven instead of config-driven', async () => {
        const devServerSource = await readFile(join(REPO_ROOT, 'packages/cli/src/dev-server.js'), 'utf8');

        expect(devServerSource).toContain('process.env.ZENITH_DEV_TRACE');
        expect(devServerSource).not.toContain('config.devTrace');
    });
});
