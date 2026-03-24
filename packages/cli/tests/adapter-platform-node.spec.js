import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

async function createProject(files) {
    const root = join(tmpdir(), `zenith-platform-node-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

describe('node adapter', () => {
    let projectRoot = null;
    let preview = null;

    afterEach(async () => {
        if (preview) {
            preview.close();
            preview = null;
        }
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
            projectRoot = null;
        }
    });

    test('node target emits a runnable server artifact with prerender, SSR, image, and route-check support', async () => {
        projectRoot = await createProject({
            'pages/index.zen': '<main>Home</main>\n',
            'pages/guides/[slug].zen': '<main>Docs Shell</main>\n',
            'pages/secure/index.zen': '<main>Secure</main>\n',
            'pages/secure/page.guard.ts': [
                'export async function guard(ctx) {',
                '  if (ctx.url.searchParams.get("auth") !== "yes") return ctx.redirect("/login?next=" + encodeURIComponent(ctx.url.pathname + ctx.url.search), 307);',
                '  ctx.env.viewer = "allowed";',
                '  return ctx.allow();',
                '}'
            ].join('\n'),
            'pages/secure/page.load.ts': [
                'export async function load(ctx) {',
                '  return ctx.data({ viewer: ctx.env.viewer, tab: ctx.url.searchParams.get("tab") });',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node", basePath: "/docs", router: true };\n'
        });

        await cli(['build'], projectRoot);

        expect(existsSync(join(projectRoot, 'dist', 'index.js'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'manifest.json'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'server', 'config.json'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'server', 'runtime', 'node-server.js'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'static', 'index.html'))).toBe(true);

        const mod = await import(pathToFileURL(join(projectRoot, 'dist', 'index.js')).href);
        expect(typeof mod.createNodeServer).toBe('function');
        expect(typeof mod.createRequestHandler).toBe('function');

        preview = await mod.createNodeServer({
            distDir: join(projectRoot, 'dist'),
            port: 0,
            host: '127.0.0.1'
        });
        const origin = `http://127.0.0.1:${preview.port}`;

        const home = await fetch(`${origin}/docs/`);
        const homeHtml = await home.text();
        expect(home.status).toBe(200);
        expect(homeHtml).toContain('src="/docs/assets/');

        const prerendered = await fetch(`${origin}/docs/guides/guide`);
        expect(prerendered.status).toBe(200);
        expect(await prerendered.text()).toContain('Docs Shell');

        const denied = await fetch(`${origin}/docs/secure?auth=no`, { redirect: 'manual' });
        expect(denied.status).toBe(307);
        expect(denied.headers.get('location')).toBe('/docs/login?next=%2Fdocs%2Fsecure%3Fauth%3Dno');

        const allowed = await fetch(`${origin}/docs/secure?auth=yes&tab=profile`);
        const allowedBody = await allowed.text();
        expect(allowed.status).toBe(200);
        expect(allowedBody).toContain('"viewer":"allowed"');
        expect(allowedBody).toContain('"tab":"profile"');

        const routeCheckDenied = await fetch(`${origin}/docs/__zenith/route-check?path=%2Fdocs%2Fsecure%3Fauth%3Dno`, {
            headers: { 'x-zenith-route-check': '1' }
        });
        const routeCheckDeniedPayload = await routeCheckDenied.json();
        expect(routeCheckDenied.status).toBe(200);
        expect(routeCheckDeniedPayload.result).toEqual({
            kind: 'redirect',
            location: '/docs/login?next=%2Fdocs%2Fsecure%3Fauth%3Dno',
            status: 307
        });

        const routeCheckForbidden = await fetch(`${origin}/docs/__zenith/route-check?path=%2Fdocs%2Fsecure`);
        expect(routeCheckForbidden.status).toBe(403);

        const imageResponse = await fetch(`${origin}/docs/_zenith/image`);
        expect(imageResponse.status).toBe(400);
        expect(await imageResponse.json()).toEqual({ error: 'missing_url' });

        const rootResponse = await fetch(`${origin}/`, { redirect: 'manual' });
        expect(rootResponse.status).toBe(404);
    });
});
