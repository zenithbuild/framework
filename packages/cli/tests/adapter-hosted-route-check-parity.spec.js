import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(30000);

async function createProject(target) {
    const root = join(tmpdir(), `zenith-hosted-route-check-${target}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const files = {
        'pages/index.zen': '<main>Home</main>\n',
        'pages/login.zen': '<main>Login</main>\n',
        'pages/secure/index.zen': [
            '<script server lang="ts">',
            'export async function guard(ctx) {',
            '  if (ctx.url.searchParams.get("auth") !== "yes") {',
            '    return ctx.redirect("/login?next=" + encodeURIComponent(ctx.url.pathname + ctx.url.search), 307);',
            '  }',
            '  ctx.env.viewer = "allowed";',
            '  return ctx.allow();',
            '}',
            'export async function load(ctx) {',
            '  return ctx.data({ viewer: ctx.env.viewer });',
            '}',
            '</script>',
            '<main>Secure</main>'
        ].join('\n'),
        'pages/api/ping.resource.ts': [
            'export async function load(ctx) {',
            '  return ctx.json({ ok: true });',
            '}'
        ].join('\n'),
        'zenith.config.js': `module.exports = { target: ${JSON.stringify(target)}, basePath: "/docs", router: true };\n`
    };

    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }

    return root;
}

async function readRouterSource(projectRoot) {
    const manifest = JSON.parse(await readFile(join(projectRoot, '.zenith-output', 'static', 'manifest.json'), 'utf8'));
    let routerAsset = String(manifest.router || '').replace(/^\/+/, '');
    const basePath = String(manifest.base_path || '').replace(/^\/+|\/+$/g, '');
    if (basePath && routerAsset.startsWith(`${basePath}/`)) {
        routerAsset = routerAsset.slice(basePath.length + 1);
    }
    return readFile(join(projectRoot, '.zenith-output', 'static', routerAsset), 'utf8');
}

function routeCheckEntrypoint(projectRoot, target) {
    if (target === 'vercel') {
        return join(projectRoot, 'dist', 'functions', '__zenith', 'route-check.func', 'index.js');
    }
    return join(projectRoot, 'dist', 'functions', '__zenith_route_check.mjs');
}

function routeCheckInternalUrl(target, publicPath) {
    const encoded = encodeURIComponent(publicPath);
    if (target === 'vercel') {
        return `https://example.com/__zenith/route-check?path=${encoded}`;
    }
    return `https://example.com/.netlify/functions/__zenith_route_check?path=${encoded}`;
}

async function executeHostedRouteCheck(projectRoot, target, publicPath, init = {}) {
    const mod = await import(pathToFileURL(routeCheckEntrypoint(projectRoot, target)).href);
    const request = new Request(routeCheckInternalUrl(target, publicPath), {
        headers: { 'x-zenith-route-check': '1' },
        ...init
    });
    if (target === 'vercel') {
        return mod.default.fetch(request);
    }
    return mod.default(request);
}

async function readHostedRouting(projectRoot, target) {
    if (target === 'vercel') {
        return JSON.parse(await readFile(join(projectRoot, 'dist', 'config.json'), 'utf8'));
    }
    return readFile(join(projectRoot, 'dist', 'publish', '_redirects'), 'utf8');
}

function expectHostedRouteCheckMetadata(routing, target) {
    if (target === 'vercel') {
        const routeCheckIndex = routing.routes.findIndex((route) => route.dest === '/__zenith/route-check');
        const secureIndex = routing.routes.findIndex((route) => route.dest === '/__zenith/secure');
        expect(routing.routes).toContainEqual({
            src: '^/docs/__zenith/route\\-check/?$',
            dest: '/__zenith/route-check'
        });
        expect(routeCheckIndex).toBeGreaterThanOrEqual(0);
        expect(secureIndex).toBeGreaterThanOrEqual(0);
        expect(routeCheckIndex).toBeLessThan(secureIndex);
        return;
    }

    const routeCheckRule = '/docs/__zenith/route-check /.netlify/functions/__zenith_route_check 200!';
    const secureRule = '/docs/secure /.netlify/functions/__zenith_secure 200!';
    expect(routing).toContain(routeCheckRule);
    expect(routing.indexOf(routeCheckRule)).toBeLessThan(routing.indexOf(secureRule));
}

describe('hosted route-check parity', () => {
    let projectRoot = null;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            projectRoot = null;
        }
    });

    test.each(['vercel', 'netlify'])(
        '%s emits and executes advisory route-check for hosted guarded pages',
        async (target) => {
            projectRoot = await createProject(target);

            await cli(['build'], projectRoot);

            expect(await readRouterSource(projectRoot)).toMatch(/const\s+__ZENITH_ROUTE_CHECK_ENABLED__\s*=\s*true;/);
            expect(existsSync(routeCheckEntrypoint(projectRoot, target))).toBe(true);
            expectHostedRouteCheckMetadata(await readHostedRouting(projectRoot, target), target);

            const denied = await executeHostedRouteCheck(projectRoot, target, '/docs/secure?auth=no');
            expect(denied.status).toBe(200);
            expect(await denied.json()).toEqual({
                result: {
                    kind: 'redirect',
                    location: '/docs/login?next=%2Fdocs%2Fsecure%3Fauth%3Dno',
                    status: 307
                },
                routeId: 'secure',
                to: 'https://example.com/docs/secure?auth=no'
            });

            const allowed = await executeHostedRouteCheck(projectRoot, target, '/docs/secure?auth=yes');
            expect(allowed.status).toBe(200);
            expect((await allowed.json()).result).toEqual({ kind: 'allow' });

            const missingHeader = await executeHostedRouteCheck(projectRoot, target, '/docs/secure', {
                headers: {}
            });
            expect(missingHeader.status).toBe(403);
            expect(await missingHeader.json()).toEqual({ error: 'forbidden', message: 'invalid request context' });

            const external = await executeHostedRouteCheck(projectRoot, target, 'https://evil.example/secure');
            expect(external.status).toBe(400);
            expect(await external.json()).toEqual({ error: 'invalid_path_format' });

            const resource = await executeHostedRouteCheck(projectRoot, target, '/docs/api/ping');
            expect(resource.status).toBe(404);
            expect(await resource.json()).toEqual({ error: 'route_not_found' });
        }
    );
});
