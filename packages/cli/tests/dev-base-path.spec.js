import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDevServer } from '../dist/dev-server.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

async function createProject(files) {
    const root = join(tmpdir(), `zenith-dev-base-path-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

describe('dev server base path', () => {
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

    test('basePath-prefixed requests and route-check resolve guarded routes canonically', async () => {
        project = await createProject({
            'pages/index.zen': '<main>Home</main>\n',
            'pages/secure/index.zen': '<main>Secure</main>\n',
            'pages/secure/page.guard.ts': [
                'export async function guard(ctx) {',
                '  if (ctx.url.searchParams.get("auth") !== "yes") return ctx.redirect("/login", 307);',
                '  return ctx.allow();',
                '}'
            ].join('\n')
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
        const denied = await fetch(`${origin}/docs/secure?auth=no`, { redirect: 'manual' });
        expect(denied.status).toBe(307);
        expect(denied.headers.get('location')).toBe('/docs/login');

        const routeCheck = await fetch(`${origin}/docs/__zenith/route-check?path=%2Fdocs%2Fsecure%3Fauth%3Dno`, {
            headers: { 'x-zenith-route-check': '1' }
        });
        expect(routeCheck.status).toBe(200);
        expect((await routeCheck.json()).result).toEqual({
            kind: 'redirect',
            location: '/docs/login',
            status: 307
        });
    });
});
