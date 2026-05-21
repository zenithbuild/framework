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
    },
    plugins: []
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
        const targets = [
            'static',
            'static-export',
            'vercel-static',
            'netlify-static',
            'vercel',
            'netlify',
            'node'
        ];

        for (const target of targets) {
            expect(validateConfig({ target }).target).toBe(target);
        }
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

    test('accepts named plugins in config shape validation', () => {
        const plugin = { name: 'auth' };
        const userConfig = { plugins: [plugin] };

        const config = validateConfig(userConfig);

        expect(config.plugins).toEqual([{ name: 'auth' }]);
        expect(userConfig).toEqual({ plugins: [plugin] });
    });

    test('rejects invalid plugin shapes', () => {
        class ClassPlugin {
            constructor() {
                this.name = 'classy';
            }
        }
        const datedPlugin = Object.assign(new Date(), { name: 'dated' });

        expect(() => validateConfig({ plugins: {} })).toThrow('Key "plugins" must be an array');
        expect(() => validateConfig({ plugins: [null] })).toThrow('Plugin at index 0 must be a plain object');
        expect(() => validateConfig({ plugins: [new ClassPlugin()] })).toThrow('Plugin at index 0 must be a plain object');
        expect(() => validateConfig({ plugins: [datedPlugin] })).toThrow('Plugin at index 0 must be a plain object');
        expect(() => validateConfig({ plugins: [{}] })).toThrow('Plugin at index 0 must have a non-empty name');
        expect(() => validateConfig({ plugins: [{ name: '  ' }] })).toThrow('non-empty name');
        expect(() => validateConfig({ plugins: [{ name: 'auth' }, { name: 'auth' }] })).toThrow('Duplicate plugin name: "auth"');
        expect(() => validateConfig({ plugins: [{ name: 'auth', transform() {} }] })).toThrow('unsupported key "transform"');
        expect(() => validateConfig({ plugins: [{ name: 'auth', resolve() {} }] })).toThrow('unsupported key "resolve"');
        expect(() => validateConfig({ plugins: [{ name: 'auth', server() {} }] })).toThrow('unsupported key "server"');
        expect(() => validateConfig({ plugins: [{ name: 'auth', middleware() {} }] })).toThrow('unsupported key "middleware"');
        expect(() => validateConfig({ plugins: [{ name: 'auth', compiler() {} }] })).toThrow('unsupported key "compiler"');
        expect(() => validateConfig({ plugins: [{ name: 'auth', bundler() {} }] })).toThrow('unsupported key "bundler"');
        expect(() => validateConfig({ plugins: [{ name: 'auth', config: true }] })).toThrow('key "config" must be a function');
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

    test('runs async plugin config hooks in deterministic order', async () => {
        tmpDir = join(tmpdir(), `zenith-cfg-${Date.now()}`);
        await mkdir(tmpDir, { recursive: true });
        await writeFile(join(tmpDir, 'zenith.config.js'), [
            'module.exports = {',
            '  plugins: [',
            '    { name: "first", async config() { return { basePath: "/first" }; } },',
            '    { name: "second", async config(config) { return { outDir: config.basePath.slice(1) + "-out" }; } }',
            '  ]',
            '};'
        ].join('\n'));

        const config = await loadConfig(tmpDir);
        expect(config.basePath).toBe('/first');
        expect(config.outDir).toBe('first-out');
    });

    test('plugin config hook mutation is not an accepted change path', async () => {
        tmpDir = join(tmpdir(), `zenith-cfg-${Date.now()}`);
        await mkdir(tmpDir, { recursive: true });
        await writeFile(join(tmpDir, 'zenith.config.js'), [
            'const userConfig = {',
            '  router: false,',
            '  plugins: [{',
            '    name: "mutator",',
            '    config(config) {',
            '      config.router = true;',
            '      return { basePath: userConfig.router ? "/mutated" : "/clean" };',
            '    }',
            '  }]',
            '};',
            'module.exports = userConfig;'
        ].join('\n'));

        const config = await loadConfig(tmpDir);
        expect(config.router).toBe(false);
        expect(config.basePath).toBe('/clean');
    });

    test('plugin config hook errors include plugin name, hook, and original message', async () => {
        tmpDir = join(tmpdir(), `zenith-cfg-${Date.now()}`);
        await mkdir(tmpDir, { recursive: true });
        await writeFile(join(tmpDir, 'zenith.config.js'), [
            'module.exports = {',
            '  plugins: [{ name: "auth", config() { throw new Error("boom"); } }]',
            '};'
        ].join('\n'));

        await expect(loadConfig(tmpDir)).rejects.toThrow('[Zenith plugin auth] config failed: boom');
    });

    test('plugin config patches are revalidated and restricted to the allowlist', async () => {
        tmpDir = join(tmpdir(), `zenith-cfg-${Date.now()}`);
        await mkdir(tmpDir, { recursive: true });
        await writeFile(join(tmpDir, 'zenith.config.js'), [
            'module.exports = {',
            '  plugins: [{ name: "auth", config() { return { target: "node" }; } }]',
            '};'
        ].join('\n'));
        await expect(loadConfig(tmpDir)).rejects.toThrow('[Zenith plugin auth] config failed: target is not patchable');

        await writeFile(join(tmpDir, 'zenith.config.js'), [
            'module.exports = {',
            '  plugins: [{ name: "auth", config() { return { router: "yes" }; } }]',
            '};'
        ].join('\n'));
        await expect(loadConfig(tmpDir)).rejects.toThrow('[Zenith plugin auth] config failed: [Zenith:Config] Key "router" must be boolean');
    });

    test('plugin config hook rejects non-plain object patches', async () => {
        tmpDir = join(tmpdir(), `zenith-cfg-${Date.now()}`);
        await mkdir(tmpDir, { recursive: true });
        await writeFile(join(tmpDir, 'zenith.config.js'), [
            'class Patch { constructor() { this.basePath = "/class"; } }',
            'module.exports = {',
            '  plugins: [{ name: "auth", config() { return new Patch(); } }]',
            '};'
        ].join('\n'));
        await expect(loadConfig(tmpDir)).rejects.toThrow('[Zenith plugin auth] config failed: config hook must return a plain object patch');

        await writeFile(join(tmpDir, 'zenith.config.js'), [
            'module.exports = {',
            '  plugins: [{ name: "auth", config() { const patch = new Date(); patch.basePath = "/date"; return patch; } }]',
            '};'
        ].join('\n'));
        await expect(loadConfig(tmpDir)).rejects.toThrow('[Zenith plugin auth] config failed: config hook must return a plain object patch');
    });

    test('plugin config patches are shallow top-level patches', async () => {
        tmpDir = join(tmpdir(), `zenith-cfg-${Date.now()}`);
        await mkdir(tmpDir, { recursive: true });
        await writeFile(join(tmpDir, 'zenith.config.js'), [
            'module.exports = {',
            '  router: true,',
            '  basePath: "/docs",',
            '  images: { formats: ["png"], quality: 70, remotePatterns: [{ hostname: "cdn.example.com" }] },',
            '  plugins: [{ name: "images", config() { return { images: { quality: 80 } }; } }]',
            '};'
        ].join('\n'));

        const config = await loadConfig(tmpDir);

        expect(config.router).toBe(true);
        expect(config.basePath).toBe('/docs');
        expect(config.images.quality).toBe(80);
        expect(config.images.formats).toEqual(['webp', 'avif']);
        expect(config.images.remotePatterns).toEqual([]);

        await writeFile(join(tmpDir, 'zenith.config.js'), [
            'module.exports = {',
            '  plugins: [{ name: "images", config() { return { images: { quality: 0 } }; } }]',
            '};'
        ].join('\n'));
        await expect(loadConfig(tmpDir)).rejects.toThrow('[Zenith plugin images] config failed: [Zenith:Config] images.quality must be a positive integer');
    });
});
