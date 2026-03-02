// ---------------------------------------------------------------------------
// config.spec.js — Config loader tests
// ---------------------------------------------------------------------------

import { validateConfig, loadConfig, getDefaults } from '../src/config.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('validateConfig', () => {
    test('null/undefined returns defaults', () => {
        expect(validateConfig(null)).toEqual({ router: false, outDir: 'dist', pagesDir: 'pages' });
        expect(validateConfig(undefined)).toEqual({ router: false, outDir: 'dist', pagesDir: 'pages' });
    });

    test('empty object returns defaults', () => {
        expect(validateConfig({})).toEqual({ router: false, outDir: 'dist', pagesDir: 'pages' });
    });

    test('valid config with overrides', () => {
        const config = validateConfig({ router: true, outDir: 'build' });
        expect(config.router).toBe(true);
        expect(config.outDir).toBe('build');
        expect(config.pagesDir).toBe('pages'); // default
    });

    test('throws on unknown keys', () => {
        expect(() => validateConfig({ foo: true })).toThrow('[Zenith:Config] Unknown key: "foo"');
    });

    test('throws on wrong type for router', () => {
        expect(() => validateConfig({ router: 'yes' })).toThrow('must be boolean');
    });

    test('throws on wrong type for outDir', () => {
        expect(() => validateConfig({ outDir: 123 })).toThrow('must be string');
    });

    test('throws on empty string for outDir', () => {
        expect(() => validateConfig({ outDir: '  ' })).toThrow('non-empty string');
    });

    test('throws on empty string for pagesDir', () => {
        expect(() => validateConfig({ pagesDir: '' })).toThrow('non-empty string');
    });

    test('throws on non-object config', () => {
        expect(() => validateConfig('string')).toThrow('must be a plain object');
        expect(() => validateConfig([1, 2])).toThrow('must be a plain object');
    });

    test('multiple overrides at once', () => {
        const config = validateConfig({ router: true, outDir: 'out', pagesDir: 'src/pages' });
        expect(config).toEqual({ router: true, outDir: 'out', pagesDir: 'src/pages' });
    });
});

describe('getDefaults', () => {
    test('returns copy of defaults', () => {
        const d1 = getDefaults();
        const d2 = getDefaults();
        expect(d1).toEqual(d2);
        expect(d1).not.toBe(d2); // not the same reference
    });
});

describe('loadConfig', () => {
    let tmpDir;

    afterEach(async () => {
        if (tmpDir) {
            await rm(tmpDir, { recursive: true, force: true });
            tmpDir = null;
        }
    });

    test('returns defaults when no config file exists', async () => {
        tmpDir = join(tmpdir(), `zenith-cfg-${Date.now()}`);
        await mkdir(tmpDir, { recursive: true });
        const config = await loadConfig(tmpDir);
        expect(config).toEqual({ router: false, outDir: 'dist', pagesDir: 'pages' });
    });

    test('loads valid config from file', async () => {
        tmpDir = join(tmpdir(), `zenith-cfg-${Date.now()}`);
        await mkdir(tmpDir, { recursive: true });
        await writeFile(join(tmpDir, 'zenith.config.js'), 'module.exports = { router: true }');
        const config = await loadConfig(tmpDir);
        expect(config.router).toBe(true);
        expect(config.outDir).toBe('dist');
    });
});
