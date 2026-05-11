import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, validateConfig as validateCliConfig } from '../dist/config.js';
import { KNOWN_TARGETS as CLI_TARGETS } from '../dist/adapters/adapter-types.js';
import { ZENITH_TARGETS as CORE_TARGETS } from '../../core/dist/config-targets.js';
import { getDefaults as getCoreDefaults, validateConfig as validateCoreConfig } from '../../core/dist/config.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const UNKNOWN_KEYS = ['softNavigation', 'types', 'assetPrefix', 'devTrace'];

describe('Batch 5A config parity', () => {
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
