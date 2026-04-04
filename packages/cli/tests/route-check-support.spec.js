import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { jest } from '@jest/globals';
import { build } from '../dist/build.js';
import { createDevServer } from '../dist/dev-server.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(30000);

async function createProject(files) {
    const root = join(tmpdir(), `zenith-route-check-support-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

async function readRouterSource(projectRoot) {
    const manifest = JSON.parse(await readFile(join(projectRoot, '.zenith-output', 'static', 'manifest.json'), 'utf8'));
    const routerAsset = String(manifest.router || '').replace(/^\/+/, '');
    return readFile(join(projectRoot, '.zenith-output', 'static', routerAsset), 'utf8');
}

describe('route-check target support', () => {
    let project = null;
    let dev = null;

    afterEach(async () => {
        if (dev) {
            dev.close();
            dev = null;
        }
        if (project) {
            await rm(project.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            project = null;
        }
    });

    test('vercel target disables router route-check and dev reports the endpoint as unsupported', async () => {
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

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: {
                target: 'vercel',
                router: true
            }
        });

        expect(await readRouterSource(project.root)).toMatch(/const\s+__ZENITH_ROUTE_CHECK_ENABLED__\s*=\s*false;/);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0,
            config: {
                target: 'vercel',
                router: true
            }
        });

        const response = await fetch(`http://127.0.0.1:${dev.port}/__zenith/route-check?path=%2Fsecure`, {
            headers: { 'x-zenith-route-check': '1' }
        });
        expect(response.status).toBe(501);
        expect(await response.json()).toEqual({ error: 'route_check_unsupported' });
    });

    test('node target keeps router route-check enabled', async () => {
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

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: {
                target: 'node',
                router: true
            }
        });

        expect(await readRouterSource(project.root)).toMatch(/const\s+__ZENITH_ROUTE_CHECK_ENABLED__\s*=\s*true;/);
    });

    test('static-export target disables router route-check and dev reports the endpoint as unsupported', async () => {
        project = await createProject({
            'pages/index.zen': '<main>Home</main>\n',
            'pages/about.zen': '<main>About</main>\n'
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: {
                target: 'static-export',
                router: true
            }
        });

        expect(await readRouterSource(project.root)).toMatch(/const\s+__ZENITH_ROUTE_CHECK_ENABLED__\s*=\s*false;/);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0,
            config: {
                target: 'static-export',
                router: true
            }
        });

        const response = await fetch(`http://127.0.0.1:${dev.port}/__zenith/route-check?path=%2Fabout`, {
            headers: { 'x-zenith-route-check': '1' }
        });
        expect(response.status).toBe(501);
        expect(await response.json()).toEqual({ error: 'route_check_unsupported' });
    });
});
