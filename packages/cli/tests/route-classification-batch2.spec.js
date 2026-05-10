import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cli } from '../dist/index.js';
import { generateManifest } from '../src/manifest.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

async function createProject(files) {
    const root = join(tmpdir(), `zenith-route-classification-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return {
        root,
        pagesDir: join(root, 'pages')
    };
}

function protectedPrerenderPage(kind) {
    return [
        '<script server lang="ts">',
        'export const prerender = true;',
        `export async function ${kind}(ctx) {`,
        kind === 'guard'
            ? '  return ctx.allow();'
            : '  return ctx.data({ ok: true });',
        '}',
        '</script>',
        '<main>protected</main>'
    ].join('\n');
}

describe('Batch 2 route classification', () => {
    let project = null;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test.each(['guard', 'load', 'action'])(
        'manifest rejects prerender=true combined with %s(ctx)',
        async (kind) => {
            project = await createProject({
                'pages/index.zen': protectedPrerenderPage(kind)
            });

            await expect(generateManifest(project.pagesDir)).rejects.toThrow(
                'Cannot prerender a static route with a `guard`, `load`, or `action` function.'
            );
        }
    );

    test('manifest keeps valid static prerender routes classified as prerender', async () => {
        project = await createProject({
            'pages/index.zen': [
                '<script server lang="ts">',
                'export const prerender = true;',
                'export const data = { ok: true };',
                '</script>',
                '<main>static</main>'
            ].join('\n')
        });

        const manifest = await generateManifest(project.pagesDir);
        expect(manifest).toEqual([
            expect.objectContaining({
                path: '/',
                render_mode: 'prerender'
            })
        ]);
    });

    test('build rejects protected prerender routes before output manifests are written', async () => {
        project = await createProject({
            'pages/index.zen': protectedPrerenderPage('guard')
        });

        await expect(cli(['build'], project.root)).rejects.toThrow(
            'Cannot prerender a static route with a `guard`, `load`, or `action` function.'
        );
    });
});
