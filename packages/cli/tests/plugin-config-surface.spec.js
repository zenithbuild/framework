import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, validateConfig } from '../dist/config.js';

describe('plugin config surface', () => {
    let projectRoot = null;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
            projectRoot = null;
        }
    });

    async function writeConfig(source) {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
            projectRoot = null;
        }
        projectRoot = join(tmpdir(), `zenith-plugin-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        await mkdir(projectRoot, { recursive: true });
        await writeFile(join(projectRoot, 'zenith.config.js'), source, 'utf8');
    }

    test('plugins are accepted and normalized without mutating the user object', () => {
        const plugin = { name: ' auth ' };
        const input = { plugins: [plugin] };

        const config = validateConfig(input);

        expect(config.plugins).toEqual([{ name: 'auth' }]);
        expect(input).toEqual({ plugins: [plugin] });
    });

    test('invalid plugin shapes are rejected', () => {
        class ClassPlugin {
            constructor() {
                this.name = 'classy';
            }
        }
        const datedPlugin = Object.assign(new Date(), { name: 'dated' });

        expect(() => validateConfig({ plugins: {} })).toThrow('Key "plugins" must be an array');
        expect(() => validateConfig({ plugins: [() => {}] })).toThrow('Plugin at index 0 must be a plain object');
        expect(() => validateConfig({ plugins: [new ClassPlugin()] })).toThrow('Plugin at index 0 must be a plain object');
        expect(() => validateConfig({ plugins: [datedPlugin] })).toThrow('Plugin at index 0 must be a plain object');
        expect(() => validateConfig({ plugins: [{}] })).toThrow('Plugin at index 0 must have a non-empty name');
        expect(() => validateConfig({ plugins: [{ name: '' }] })).toThrow('non-empty name');
        expect(() => validateConfig({ plugins: [{ name: 'auth', config: true }] })).toThrow('key "config" must be a function');
    });

    test('duplicate names and unsupported hooks are rejected', () => {
        expect(() => validateConfig({ plugins: [{ name: 'auth' }, { name: 'auth' }] })).toThrow('Duplicate plugin name: "auth"');
        expect(() => validateConfig({ plugins: [{ name: 'auth', middleware() {} }] })).toThrow('unsupported key "middleware"');
        expect(() => validateConfig({ plugins: [{ name: 'auth', transform() {} }] })).toThrow('unsupported key "transform"');
        expect(() => validateConfig({ plugins: [{ name: 'auth', resolve() {} }] })).toThrow('unsupported key "resolve"');
        expect(() => validateConfig({ plugins: [{ name: 'auth', server() {} }] })).toThrow('unsupported key "server"');
        expect(() => validateConfig({ plugins: [{ name: 'auth', compiler() {} }] })).toThrow('unsupported key "compiler"');
        expect(() => validateConfig({ plugins: [{ name: 'auth', bundler() {} }] })).toThrow('unsupported key "bundler"');
    });

    test('async config hooks run in deterministic order and apply returned patches', async () => {
        await writeConfig([
            'module.exports = {',
            '  plugins: [',
            '    { name: "first", async config() { return { basePath: "/first" }; } },',
            '    { name: "second", async config(config) { return { outDir: config.basePath.slice(1) + "-out" }; } }',
            '  ]',
            '};'
        ].join('\n'));

        const config = await loadConfig(projectRoot);

        expect(config.basePath).toBe('/first');
        expect(config.outDir).toBe('first-out');
    });

    test('direct hook mutation does not mutate source config or resolved config', async () => {
        await writeConfig([
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

        const config = await loadConfig(projectRoot);

        expect(config.router).toBe(false);
        expect(config.basePath).toBe('/clean');
    });

    test('hook errors include plugin name, hook, and original message', async () => {
        await writeConfig([
            'module.exports = {',
            '  plugins: [{ name: "auth", config() { throw new Error("boom"); } }]',
            '};'
        ].join('\n'));

        await expect(loadConfig(projectRoot)).rejects.toThrow('[Zenith plugin auth] config failed: boom');
    });

    test('patches are revalidated and cannot set disallowed keys', async () => {
        await writeConfig([
            'module.exports = {',
            '  plugins: [{ name: "auth", config() { return { target: "node" }; } }]',
            '};'
        ].join('\n'));
        await expect(loadConfig(projectRoot)).rejects.toThrow('[Zenith plugin auth] config failed: target is not patchable');

        await writeConfig([
            'module.exports = {',
            '  plugins: [{ name: "auth", config() { return { router: "yes" }; } }]',
            '};'
        ].join('\n'));
        await expect(loadConfig(projectRoot)).rejects.toThrow('[Zenith plugin auth] config failed: [Zenith:Config] Key "router" must be boolean');
    });

    test('non-plain config hook patches are rejected', async () => {
        await writeConfig([
            'class Patch { constructor() { this.basePath = "/class"; } }',
            'module.exports = {',
            '  plugins: [{ name: "auth", config() { return new Patch(); } }]',
            '};'
        ].join('\n'));
        await expect(loadConfig(projectRoot)).rejects.toThrow('[Zenith plugin auth] config failed: config hook must return a plain object patch');

        await writeConfig([
            'module.exports = {',
            '  plugins: [{ name: "auth", config() { const patch = new Date(); patch.basePath = "/date"; return patch; } }]',
            '};'
        ].join('\n'));
        await expect(loadConfig(projectRoot)).rejects.toThrow('[Zenith plugin auth] config failed: config hook must return a plain object patch');
    });

    test('config hook patches are shallow top-level patches', async () => {
        await writeConfig([
            'module.exports = {',
            '  router: true,',
            '  basePath: "/docs",',
            '  images: { formats: ["png"], quality: 70, remotePatterns: [{ hostname: "cdn.example.com" }] },',
            '  plugins: [{ name: "images", config() { return { images: { quality: 80 } }; } }]',
            '};'
        ].join('\n'));

        const config = await loadConfig(projectRoot);

        expect(config.router).toBe(true);
        expect(config.basePath).toBe('/docs');
        expect(config.images.quality).toBe(80);
        expect(config.images.formats).toEqual(['webp', 'avif']);
        expect(config.images.remotePatterns).toEqual([]);

        await writeConfig([
            'module.exports = {',
            '  plugins: [{ name: "images", config() { return { images: { quality: 0 } }; } }]',
            '};'
        ].join('\n'));
        await expect(loadConfig(projectRoot)).rejects.toThrow('[Zenith plugin images] config failed: [Zenith:Config] images.quality must be a positive integer');
    });

    test('config hook cannot patch plugins, adapter, or pagesDir', async () => {
        for (const key of ['plugins', 'adapter', 'pagesDir']) {
            await writeConfig([
                'module.exports = {',
                `  plugins: [{ name: "auth", config() { return { ${key}: ${key === 'plugins' ? '[]' : '"blocked"'} }; } }]`,
                '};'
            ].join('\n'));
            await expect(loadConfig(projectRoot)).rejects.toThrow(`[Zenith plugin auth] config failed: ${key} is not patchable`);
        }
    });
});
