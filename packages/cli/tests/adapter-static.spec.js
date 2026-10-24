import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

async function createProject(files) {
    const root = join(tmpdir(), `zenith-adapter-static-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

describe('static adapter', () => {
    let projectRoot = null;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
            projectRoot = null;
        }
    });

    test('cli build writes canonical output to .zenith-output and adapts it to dist', async () => {
        projectRoot = await createProject({
            'pages/index.zen': '<main>home</main>\n'
        });

        await cli(['build'], projectRoot);

        const coreHtml = await readFile(join(projectRoot, '.zenith-output', 'static', 'index.html'), 'utf8');
        const distHtml = await readFile(join(projectRoot, 'dist', 'index.html'), 'utf8');
        const buildManifest = JSON.parse(
            await readFile(join(projectRoot, '.zenith-output', 'manifest.json'), 'utf8')
        );

        expect(coreHtml).toContain('<!DOCTYPE html>');
        expect(distHtml).toBe(coreHtml);
        expect(existsSync(join(projectRoot, '.zenith-output', 'static', 'manifest.json'))).toBe(true);
        expect(buildManifest).toMatchObject({
            schema_version: 1,
            target: 'static',
            base_path: '/',
            routes: [
                {
                    path: '/',
                    file: 'index.zen',
                    path_kind: 'static',
                    render_mode: 'prerender',
                    html: '/index.html'
                }
            ]
        });
        expect(typeof buildManifest.content_hash).toBe('string');
        expect(Array.isArray(buildManifest.assets.js)).toBe(true);
        expect(Array.isArray(buildManifest.assets.css)).toBe(true);
    });

    test('default static target rejects server render_mode routes', async () => {
        projectRoot = await createProject({
            'pages/index.zen': [
                '<script server lang="ts">',
                'export const data = { ok: true };',
                '</script>',
                '<main>{data.ok}</main>'
            ].join('\n')
        });

        await expect(cli(['build'], projectRoot)).rejects.toThrow(
            'target "static" cannot emit server-rendered routes'
        );
    });

    test('static target preserves a non-root base path in emitted HTML and manifest contracts', async () => {
        projectRoot = await createProject({
            'pages/index.zen': '<main><a data-zen-link="true" href="/about">About</a></main>\n',
            'pages/about.zen': '<main>about</main>\n',
            'zenith.config.js': 'module.exports = { basePath: "/docs", router: true };\n'
        });

        await cli(['build'], projectRoot);

        const distHtml = await readFile(join(projectRoot, 'dist', 'index.html'), 'utf8');
        const buildManifest = JSON.parse(
            await readFile(join(projectRoot, '.zenith-output', 'manifest.json'), 'utf8')
        );
        const bundlerManifest = JSON.parse(
            await readFile(join(projectRoot, 'dist', 'manifest.json'), 'utf8')
        );

        expect(distHtml).toContain('href="/docs/about"');
        expect(distHtml).toContain('src="/docs/assets/');
        expect(buildManifest.base_path).toBe('/docs');
        expect(bundlerManifest.base_path).toBe('/docs');
        expect(bundlerManifest.entry).toContain('/docs/assets/');
    });
});
