import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDevBuildSession } from '../dist/dev-build-session.js';
import { createDevServer } from '../dist/dev-server.js';
import { loadRouteSurfaceState } from '../dist/preview.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

async function createProject(files) {
    const root = join(tmpdir(), `zenith-dev-rebuild-cache-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

async function fetchStatus(url) {
    const response = await fetch(url);
    await response.arrayBuffer();
    return response.status;
}

describe('Batch 2 dev rebuild cache', () => {
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

    test('deleted pages are removed from dev route state and are not served from stale HTML', async () => {
        project = await createProject({
            'pages/index.zen': '<main>Home</main>\n',
            'pages/about.zen': '<main>About</main>\n'
        });
        const aboutFile = join(project.pagesDir, 'about.zen');
        const session = createDevBuildSession(project);

        await session.build({ showBundlerInfo: false });
        expect((await loadRouteSurfaceState(project.outDir)).pageRoutes.map((route) => route.path)).toContain('/about');

        await unlink(aboutFile);
        await session.build({ changedFiles: [aboutFile], showBundlerInfo: false });
        expect((await loadRouteSurfaceState(project.outDir)).pageRoutes.map((route) => route.path)).not.toContain('/about');

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });
        expect(await fetchStatus(`http://127.0.0.1:${dev.port}/about`)).toBe(404);
    });

    test('static-to-interactive page changes force runtime and client bundle emission', async () => {
        project = await createProject({
            'pages/index.zen': '<main>Home</main>\n'
        });
        const indexFile = join(project.pagesDir, 'index.zen');
        const session = createDevBuildSession(project);

        await session.build({ showBundlerInfo: false });
        expect(existsSync(join(project.outDir, 'assets', 'runtime.dev.js'))).toBe(false);

        await writeFile(indexFile, [
            '<script lang="ts">',
            'function save() {}',
            '</script>',
            '<button on:click={save}>Save</button>'
        ].join('\n'), 'utf8');
        await session.build({ changedFiles: [indexFile], showBundlerInfo: false });

        const html = await readFile(join(project.outDir, 'index.html'), 'utf8');
        expect(html).toContain('src="/assets/index.dev.js"');
        expect(existsSync(join(project.outDir, 'assets', 'runtime.dev.js'))).toBe(true);
        expect(existsSync(join(project.outDir, 'assets', 'core.dev.js'))).toBe(true);
        expect(existsSync(join(project.outDir, 'assets', 'index.dev.js'))).toBe(true);
    });
});
