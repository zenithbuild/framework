// ---------------------------------------------------------------------------
// config.spec.js — Config loader tests
// ---------------------------------------------------------------------------

import { validateConfig, loadConfig, getDefaults } from '../dist/config.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const DEFAULT_CONFIG = {
    router: false,
    embeddedMarkupExpressions: false,
    typescriptDefault: true,
    outDir: 'dist',
    pagesDir: 'pages',
    basePath: '/',
    target: 'static',
    adapter: null,
    strictDomLints: false,
    images: {
        formats: ['webp', 'avif'],
        quality: 75,
        deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
        remotePatterns: [],
        allowSvg: false,
        maxRemoteBytes: 10 * 1024 * 1024,
        maxPixels: 40_000_000,
        minimumCacheTTL: 60,
        dangerouslyAllowLocalNetwork: false
    }
};

describe('validateConfig', () => {
    test('null/undefined returns defaults', () => {
        expect(validateConfig(null)).toEqual(DEFAULT_CONFIG);
        expect(validateConfig(undefined)).toEqual(DEFAULT_CONFIG);
    });

    test('empty object returns defaults', () => {
        expect(validateConfig({})).toEqual(DEFAULT_CONFIG);
    });

    test('valid config with overrides', () => {
        const config = validateConfig({ router: true, outDir: 'build', basePath: '/docs' });
        expect(config.router).toBe(true);
        expect(config.outDir).toBe('build');
        expect(config.basePath).toBe('/docs');
        expect(config.pagesDir).toBe('pages'); // default
        expect(config.target).toBe('static');
        expect(config.adapter).toBeNull();
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

    test('normalizes and validates basePath', () => {
        expect(validateConfig({ basePath: '/docs/' }).basePath).toBe('/docs');
        expect(() => validateConfig({ basePath: 'docs' })).toThrow('must start with "/"');
        expect(() => validateConfig({ basePath: '/docs?x=1' })).toThrow('must not include query or hash');
    });

    test('throws on non-object config', () => {
        expect(() => validateConfig('string')).toThrow('must be a plain object');
        expect(() => validateConfig([1, 2])).toThrow('must be a plain object');
    });

    test('multiple overrides at once', () => {
        const config = validateConfig({
            router: true,
            outDir: 'out',
            pagesDir: 'src/pages',
            basePath: '/docs',
            target: 'static'
        });
        expect(config).toEqual({
            ...DEFAULT_CONFIG,
            router: true,
            outDir: 'out',
            pagesDir: 'src/pages',
            basePath: '/docs',
            target: 'static'
        });
    });

    test('throws when target and adapter are both provided', () => {
        const fakeAdapter = {
            name: 'custom',
            validateRoutes() {},
            async adapt() {}
        };

        expect(() => validateConfig({ target: 'static', adapter: fakeAdapter })).toThrow('mutually exclusive');
    });

    test('throws on unsupported target values', () => {
        expect(() => validateConfig({ target: 'edge' })).toThrow('Unsupported target');
    });

    test('accepts supported deployment targets', () => {
        expect(validateConfig({ target: 'vercel-static' }).target).toBe('vercel-static');
        expect(validateConfig({ target: 'netlify-static' }).target).toBe('netlify-static');
        expect(validateConfig({ target: 'vercel' }).target).toBe('vercel');
        expect(validateConfig({ target: 'netlify' }).target).toBe('netlify');
        expect(validateConfig({ target: 'node' }).target).toBe('node');
    });

    test('normalizes images config', () => {
        const config = validateConfig({
            images: {
                remotePatterns: [
                    {
                        hostname: 'images.example.com',
                        pathname: '/blog/**'
                    }
                ],
                quality: 80
            }
        });
        expect(config.images.quality).toBe(80);
        expect(config.images.remotePatterns).toEqual([
            {
                protocol: 'https',
                hostname: 'images.example.com',
                port: '',
                pathname: '/blog/**',
                search: ''
            }
        ]);
    });

    test('throws on malformed images config', () => {
        expect(() => validateConfig({ images: { remotePatterns: [{ pathname: '/blog/**' }] } })).toThrow('hostname is required');
        expect(() => validateConfig({ images: { quality: 0 } })).toThrow('positive integer');
    });
});

describe('getDefaults', () => {
    test('returns copy of defaults', () => {
        const d1 = getDefaults();
        const d2 = getDefaults();
        expect(d1).toEqual(d2);
        expect(d1).not.toBe(d2); // not the same reference
        expect(d1.images).not.toBe(d2.images);
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
        expect(config).toEqual(DEFAULT_CONFIG);
    });

    test('loads valid config from file', async () => {
        tmpDir = join(tmpdir(), `zenith-cfg-${Date.now()}`);
        await mkdir(tmpDir, { recursive: true });
        await writeFile(join(tmpDir, 'zenith.config.js'), 'module.exports = { router: true }');
        const config = await loadConfig(tmpDir);
        expect(config.router).toBe(true);
        expect(config.outDir).toBe('dist');
        expect(config.basePath).toBe('/');
        expect(config.target).toBe('static');
    });

    test('reloads updated CommonJS config files in the same process', async () => {
        tmpDir = join(tmpdir(), `zenith-cfg-${Date.now()}`);
        await mkdir(tmpDir, { recursive: true });
        const configPath = join(tmpDir, 'zenith.config.js');

        await writeFile(configPath, 'module.exports = { target: "vercel", basePath: "/docs" }');
        expect(await loadConfig(tmpDir)).toMatchObject({ target: 'vercel', basePath: '/docs' });

        await writeFile(configPath, 'module.exports = { target: "netlify", basePath: "/app" }');
        expect(await loadConfig(tmpDir)).toMatchObject({ target: 'netlify', basePath: '/app' });
    });
});
