import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateManifest } from '../src/manifest.js';

async function createPages(files) {
    const root = join(tmpdir(), `zenith-manifest-categories-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

describe('manifest categories', () => {
    let pagesDir = null;

    afterEach(async () => {
        if (pagesDir) {
            await rm(pagesDir, { recursive: true, force: true });
            pagesDir = null;
        }
    });

    test('plain static pages are prerender/static with no params', async () => {
        pagesDir = await createPages({
            'index.zen': '<main>home</main>\n'
        });

        const manifest = await generateManifest(pagesDir);

        expect(manifest[0]).toMatchObject({
            path: '/',
            path_kind: 'static',
            render_mode: 'prerender',
            params: []
        });
    });

    test('dynamic routes with request-time server scripts are dynamic/server', async () => {
        pagesDir = await createPages({
            'users/[id].zen': [
                '<script server lang="ts">',
                'export const data = { ok: true };',
                '</script>',
                '<main>{params.id}</main>'
            ].join('\n')
        });

        const manifest = await generateManifest(pagesDir);

        expect(manifest[0]).toMatchObject({
            path: '/users/:id',
            path_kind: 'dynamic',
            render_mode: 'server',
            params: ['id']
        });
    });

    test('prerender=true keeps inline server routes in prerender mode', async () => {
        pagesDir = await createPages({
            'docs/[slug].zen': [
                '<script server lang="ts">',
                'export const prerender = true;',
                'export const data = { section: "docs" };',
                '</script>',
                '<main>{params.slug}</main>'
            ].join('\n')
        });

        const manifest = await generateManifest(pagesDir);

        expect(manifest[0]).toMatchObject({
            path: '/docs/:slug',
            path_kind: 'dynamic',
            render_mode: 'prerender',
            params: ['slug']
        });
    });

    test('adjacent load modules classify routes as server-rendered', async () => {
        pagesDir = await createPages({
            'blog/index.zen': '<main>blog</main>\n',
            'blog/page.load.ts': 'export const load = async () => ({ posts: [] });\n'
        });

        const manifest = await generateManifest(pagesDir);

        expect(manifest[0]).toMatchObject({
            path: '/blog',
            path_kind: 'static',
            render_mode: 'server',
            params: []
        });
    });
});
