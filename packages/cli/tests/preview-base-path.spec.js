import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from '../dist/build.js';
import { createPreviewServer } from '../dist/preview.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

async function createProject(files) {
    const root = join(tmpdir(), `zenith-preview-base-path-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return {
        root,
        pagesDir: join(root, 'pages'),
        outDir: join(root, 'dist')
    };
}

describe('preview base path', () => {
    let project = null;
    let preview = null;

    afterEach(async () => {
        if (preview) {
            preview.close();
            preview = null;
        }
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('static preview serves the built app at basePath and keeps public URLs prefixed', async () => {
        project = await createProject({
            'pages/index.zen': '<main><a data-zen-link="true" href="/about">About</a></main>\n',
            'pages/about.zen': '<main>about</main>\n'
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: {
                router: true,
                basePath: '/docs'
            }
        });

        preview = await createPreviewServer({
            distDir: project.outDir,
            port: 0,
            config: { basePath: '/docs' }
        });

        const origin = `http://127.0.0.1:${preview.port}`;
        const rootResponse = await fetch(`${origin}/`, { redirect: 'manual' });
        expect(rootResponse.status).toBe(404);

        const pageResponse = await fetch(`${origin}/docs/`);
        const html = await pageResponse.text();
        expect(pageResponse.status).toBe(200);
        expect(html).toContain('href="/docs/about"');
        expect(html).toContain('src="/docs/assets/');
        expect(html).toContain('href="/docs/assets/');

        const assetMatch = html.match(/src="(\/docs\/assets\/[^"]+\.js)"/);
        expect(assetMatch).not.toBeNull();
        const assetResponse = await fetch(`${origin}${assetMatch[1]}`);
        expect(assetResponse.status).toBe(200);
        expect(String(assetResponse.headers.get('content-type') || '')).toContain('javascript');
    });
});
