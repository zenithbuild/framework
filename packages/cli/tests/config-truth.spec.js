import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { jest } from '@jest/globals';
import { build } from '../dist/build.js';
import { loadConfig } from '../dist/config.js';
import { cli } from '../dist/index.js';

jest.setTimeout(30000);

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+xIhUAAAAASUVORK5CYII=',
    'base64'
);
const PHASE_ONE_BASELINE_KEYS = [
    'adapter',
    'basePath',
    'embeddedMarkupExpressions',
    'images',
    'outDir',
    'pagesDir',
    'router',
    'strictDomLints',
    'target',
    'typescriptDefault'
];

async function createProject(files) {
    const root = join(tmpdir(), `zenith-config-truth-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents);
    }
    return {
        root,
        pagesDir: join(root, 'pages'),
        outDir: join(root, 'dist')
    };
}

async function listAssetFiles(outDir) {
    try {
        return await readdir(join(outDir, 'assets'));
    } catch {
        return [];
    }
}

describe('config truth', () => {
    let project = null;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('cli build writes to config.outDir', async () => {
        project = await createProject({
            'pages/index.zen': '<main>custom output</main>\n',
            'zenith.config.js': 'module.exports = { outDir: "build-output" };\n'
        });

        await cli(['build'], project.root);

        const customOutputPath = join(project.root, 'build-output', 'index.html');
        expect(await readFile(customOutputPath, 'utf8')).toContain('custom output');
        expect(existsSync(join(project.root, 'dist', 'index.html'))).toBe(false);
    });

    test('phase 1 baseline exposes the truthful top-level config keys', async () => {
        project = await createProject({});

        const config = await loadConfig(project.root);
        expect(Object.keys(config).sort()).toEqual(PHASE_ONE_BASELINE_KEYS);
        expect(config.target).toBe('static');
        expect(config.adapter).toBeNull();
    });

    test('cli build scans config.pagesDir instead of the default pages directory', async () => {
        project = await createProject({
            'pages/index.zen': '<main>default pages dir</main>\n',
            'src/site-pages/index.zen': '<main>configured pages dir</main>\n',
            'zenith.config.js': 'module.exports = { pagesDir: "src/site-pages" };\n'
        });

        await cli(['build'], project.root);

        const html = await readFile(join(project.outDir, 'index.html'), 'utf8');
        expect(html).toContain('configured pages dir');
        expect(html).not.toContain('default pages dir');
    });

    test('basePath prefixes emitted public URLs and soft-navigation hrefs', async () => {
        project = await createProject({
            'pages/index.zen': '<main><a data-zen-link="true" href="/about">About</a></main>\n',
            'pages/about.zen': '<main>about</main>\n'
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { router: true, basePath: '/docs' }
        });

        const html = await readFile(join(project.outDir, 'index.html'), 'utf8');
        const manifest = JSON.parse(await readFile(join(project.outDir, 'manifest.json'), 'utf8'));

        expect(html).toContain('href="/docs/about"');
        expect(html).toContain('src="/docs/assets/');
        expect(html).toContain('href="/docs/assets/');
        expect(manifest.base_path).toBe('/docs');
        expect(manifest.entry).toContain('/docs/assets/');
    });

    test('router=true emits router bundle, router manifest, and router bootstrap markup', async () => {
        project = await createProject({
            'pages/index.zen': '<main><a href="/users/42">User</a></main>\n',
            'pages/users/[id].zen': '<main>{params.id}</main>\n'
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { router: true }
        });

        const assetFiles = await listAssetFiles(project.outDir);
        expect(assetFiles).toContain('router-manifest.json');
        expect(assetFiles.some((name) => /^router\..+\.js$/.test(name))).toBe(true);
        expect(await readFile(join(project.outDir, 'index.html'), 'utf8')).toContain('data-zx-router');
    });

    test('router=false skips client router injection', async () => {
        project = await createProject({
            'pages/index.zen': '<main><a href="/users/42">User</a></main>\n',
            'pages/users/[id].zen': '<main>{params.id}</main>\n'
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { router: false }
        });

        const assetFiles = await listAssetFiles(project.outDir);
        // Preview still consumes router-manifest.json for route resolution. The contract here is
        // specifically that router=false skips client bootstrap/runtime behavior.
        expect(assetFiles.some((name) => /^router\..+\.js$/.test(name))).toBe(false);
        expect(await readFile(join(project.outDir, 'index.html'), 'utf8')).not.toContain('data-zx-router');
        const manifest = JSON.parse(await readFile(join(project.outDir, 'manifest.json'), 'utf8'));
        expect(manifest.router).toBeNull();
    });

    test('embeddedMarkupExpressions gates embedded markup lowering', async () => {
        project = await createProject({
            'pages/index.zen': [
                '<script lang="ts">',
                'const items = ["one"];',
                '</script>',
                '<main>{items.map((item) => (<span>{item}</span>))}</main>'
            ].join('\n')
        });

        await expect(build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { embeddedMarkupExpressions: false }
        })).rejects.toThrow();

        await expect(build({
            pagesDir: project.pagesDir,
            outDir: join(project.root, 'dist-embedded'),
            config: { embeddedMarkupExpressions: true }
        })).resolves.toMatchObject({ pages: 1 });
    });

    test('typescriptDefault controls lang=\"ts\" enforcement for server scripts', async () => {
        project = await createProject({
            'pages/index.zen': '<script server>export const data = { ok: true };</script><main>{data.ok}</main>\n'
        });

        await expect(build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { typescriptDefault: false }
        })).rejects.toThrow('Zenith requires TypeScript server scripts');

        await expect(build({
            pagesDir: project.pagesDir,
            outDir: join(project.root, 'dist-typescript-default'),
            config: { typescriptDefault: true }
        })).resolves.toMatchObject({ pages: 1 });
    });

    test('strictDomLints promotes ZEN-DOM warnings into build failures', async () => {
        project = await createProject({
            'pages/index.zen': [
                '<script lang="ts">',
                'const el = document.querySelector(".x");',
                '</script>',
                '<main class="x">strict dom</main>'
            ].join('\n')
        });

        const originalWarn = console.warn;
        console.warn = () => {};
        try {
            await expect(build({
                pagesDir: project.pagesDir,
                outDir: project.outDir,
                config: { strictDomLints: false }
            })).resolves.toMatchObject({ pages: 1 });
        } finally {
            console.warn = originalWarn;
        }

        await expect(build({
            pagesDir: project.pagesDir,
            outDir: join(project.root, 'dist-strict-dom'),
            config: { strictDomLints: true }
        })).rejects.toThrow('Compiler failed');
    });

    test('images config activates the image pipeline', async () => {
        project = await createProject({
            'pages/index.zen': '<main><Image src="/hero.png" alt="Hero" sizes="100vw" /></main>\n',
            'public/hero.png': PNG_1X1
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: {
                images: {
                    formats: ['webp'],
                    deviceSizes: [1],
                    imageSizes: [1]
                }
            }
        });

        const manifest = JSON.parse(
            await readFile(join(project.outDir, '_zenith', 'image', 'manifest.json'), 'utf8')
        );
        expect(manifest['/hero.png']).toMatchObject({
            width: 1,
            height: 1,
            availableWidths: [1]
        });
    });

    test('softNavigation is rejected as an unknown config key', async () => {
        project = await createProject({
            'zenith.config.js': 'module.exports = { softNavigation: true };\n'
        });

        await expect(loadConfig(project.root)).rejects.toThrow('[Zenith:Config] Unknown key: "softNavigation"');
    });

    test('types is rejected as an unknown config key', async () => {
        project = await createProject({
            'zenith.config.js': 'module.exports = { types: true };\n'
        });

        await expect(loadConfig(project.root)).rejects.toThrow('[Zenith:Config] Unknown key: "types"');
    });

    test('assetPrefix is rejected as an unknown config key', async () => {
        project = await createProject({
            'zenith.config.js': 'module.exports = { assetPrefix: "/cdn" };\n'
        });

        await expect(loadConfig(project.root)).rejects.toThrow('[Zenith:Config] Unknown key: "assetPrefix"');
    });
});
