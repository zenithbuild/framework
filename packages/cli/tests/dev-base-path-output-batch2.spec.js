import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDevServer } from '../dist/dev-server.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

async function createProject(files) {
    const root = join(tmpdir(), `zenith-dev-base-output-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

async function fetchText(url) {
    const response = await fetch(url);
    return {
        status: response.status,
        body: await response.text()
    };
}

describe('Batch 2 dev basePath output', () => {
    let project = null;
    let dev = null;

    afterEach(async () => {
        if (dev) {
            dev.close();
            dev = null;
        }
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('dev HTML, asset URLs, manifest, and soft links honor basePath', async () => {
        project = await createProject({
            'pages/index.zen': '<main><a data-zen-link href="/about">About</a></main>\n',
            'pages/about.zen': '<main>About</main>\n'
        });

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0,
            config: {
                router: true,
                basePath: '/docs'
            }
        });

        const origin = `http://127.0.0.1:${dev.port}`;
        const home = await fetchText(`${origin}/docs/`);
        expect(home.status).toBe(200);
        expect(home.body).toContain('src="/docs/assets/router.dev.js"');
        expect(home.body).toContain('href="/docs/assets/styles.dev.css"');
        expect(home.body).toContain('href="/docs/about"');

        expect((await fetchText(`${origin}/docs/assets/router.dev.js`)).status).toBe(200);
        expect((await fetchText(`${origin}/docs/assets/styles.dev.css`)).status).toBe(200);
        expect((await fetchText(`${origin}/docs/about`)).status).toBe(200);

        const manifest = JSON.parse(await readFile(join(project.outDir, 'manifest.json'), 'utf8'));
        const routerManifest = JSON.parse(await readFile(join(project.outDir, 'assets', 'router-manifest.json'), 'utf8'));
        expect(manifest.base_path).toBe('/docs');
        expect(manifest.entry).toBe('/docs/assets/runtime.dev.js');
        expect(manifest.router).toBe('/docs/assets/router.dev.js');
        expect(routerManifest.base_path).toBe('/docs');
    });
});
