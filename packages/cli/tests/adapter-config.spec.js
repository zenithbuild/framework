import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, validateConfig } from '../dist/config.js';
import { resolveBuildAdapter } from '../dist/adapters/resolve-adapter.js';

async function createProject(files = {}) {
    const root = join(tmpdir(), `zenith-adapter-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

describe('adapter config', () => {
    let projectRoot = null;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
            projectRoot = null;
        }
    });

    test('loaded config defaults to target=static', async () => {
        projectRoot = await createProject();

        const config = await loadConfig(projectRoot);
        const resolved = resolveBuildAdapter(config);

        expect(config.target).toBe('static');
        expect(config.adapter).toBeNull();
        expect(resolved.target).toBe('static');
        expect(resolved.adapter.name).toBe('static');
        expect(resolved.mode).toBe('target');
    });

    test('deployment targets resolve to concrete adapters', () => {
        const vercel = resolveBuildAdapter(validateConfig({ target: 'vercel-static' }));
        const netlify = resolveBuildAdapter(validateConfig({ target: 'netlify-static' }));
        const vercelServer = resolveBuildAdapter(validateConfig({ target: 'vercel' }));
        const netlifyServer = resolveBuildAdapter(validateConfig({ target: 'netlify' }));
        const nodeServer = resolveBuildAdapter(validateConfig({ target: 'node' }));

        expect(vercel.target).toBe('vercel-static');
        expect(vercel.adapter.name).toBe('vercel-static');
        expect(netlify.target).toBe('netlify-static');
        expect(netlify.adapter.name).toBe('netlify-static');
        expect(vercelServer.target).toBe('vercel');
        expect(vercelServer.adapter.name).toBe('vercel');
        expect(netlifyServer.target).toBe('netlify');
        expect(netlifyServer.adapter.name).toBe('netlify');
        expect(nodeServer.target).toBe('node');
        expect(nodeServer.adapter.name).toBe('node');
    });

    test('adapter and target are mutually exclusive', () => {
        const fakeAdapter = {
            name: 'custom',
            validateRoutes() {},
            async adapt() {}
        };

        expect(() => validateConfig({
            target: 'static',
            adapter: fakeAdapter
        })).toThrow('mutually exclusive');
    });

    test('node target resolves as a concrete adapter', () => {
        const resolved = resolveBuildAdapter(validateConfig({ target: 'node' }));

        expect(resolved.target).toBe('node');
        expect(resolved.adapter.name).toBe('node');
    });

    test('custom adapters resolve without a target shorthand', () => {
        const fakeAdapter = {
            name: 'custom-static',
            validateRoutes() {},
            async adapt() {}
        };

        const config = validateConfig({ adapter: fakeAdapter });
        const resolved = resolveBuildAdapter(config);

        expect(resolved.target).toBe('custom-static');
        expect(resolved.adapter).toBe(fakeAdapter);
        expect(resolved.mode).toBe('adapter');
    });

    test('loadConfig supports zenith.config.ts', async () => {
        projectRoot = await createProject({
            'zenith.config.ts': [
                'export default {',
                '  target: "static",',
                '  outDir: "build-output",',
                '  basePath: "/docs"',
                '};'
            ].join('\n')
        });

        const config = await loadConfig(projectRoot);
        expect(config.target).toBe('static');
        expect(config.outDir).toBe('build-output');
        expect(config.basePath).toBe('/docs');
    });
});
