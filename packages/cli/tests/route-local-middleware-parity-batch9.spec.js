import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';
import { createDevServer } from '../dist/dev-server.js';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(45000);

async function createProject(files) {
    const root = join(tmpdir(), `zenith-route-middleware-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

function routeLocalMiddlewareFiles(target = 'node') {
    return {
        'pages/login.zen': '<main>Login</main>\n',
        'pages/protected.zen': [
            '<script server lang="ts">',
            "import { withMiddleware } from 'zenith:server-contract';",
            'const requireUser = (next) => async (ctx) => {',
            '  const viewer = String(ctx.headers["x-user"] || "").trim();',
            '  if (!viewer) return ctx.redirect("/login", 307);',
            '  ctx.env.viewer = viewer;',
            '  return next(ctx);',
            '};',
            'const markLoad = (next) => async (ctx) => {',
            '  ctx.env.loadMiddleware = "seen";',
            '  return next(ctx);',
            '};',
            'export const guard = withMiddleware(async (ctx) => ctx.allow(), requireUser);',
            'export const load = withMiddleware(async (ctx) => ctx.data({',
            '  viewer: ctx.env.viewer,',
            '  marker: ctx.env.loadMiddleware,',
            '  pathname: ctx.url.pathname',
            '}), markLoad);',
            '</script>',
            '<main>Protected</main>'
        ].join('\n'),
        'pages/api/local.resource.ts': [
            "import { withMiddleware } from 'zenith:server-contract';",
            'const requireToken = (next) => async (ctx) => {',
            '  if (ctx.headers["x-token"] !== "ok") return ctx.deny(401, "token required");',
            '  ctx.env.tokenSeen = true;',
            '  return next(ctx);',
            '};',
            'const signInFromMiddleware = (next) => async (ctx) => {',
            '  if (ctx.headers["x-signin"] === "yes") await ctx.auth.signIn({ source: "middleware" });',
            '  return next(ctx);',
            '};',
            'export const load = withMiddleware(async (ctx) => ctx.json({',
            '  ok: ctx.env.tokenSeen,',
            '  route: ctx.route.pattern',
            '}), requireToken, signInFromMiddleware);',
            'export const action = withMiddleware(async (ctx) => ctx.redirect("/thanks", 303), requireToken);'
        ].join('\n'),
        'zenith.config.js': `module.exports = { target: ${JSON.stringify(target)}, router: true };\n`
    };
}

function extractSsrPayload(html) {
    const payloadMatch = html.match(/window\.__zenith_ssr_data\s*=\s*(\{[\s\S]*?\});/);
    expect(payloadMatch).toBeTruthy();
    return JSON.parse(String(payloadMatch[1]));
}

function getSetCookieValues(headers) {
    if (typeof headers?.getSetCookie === 'function') {
        return headers.getSetCookie();
    }
    const raw = headers?.get?.('set-cookie');
    return typeof raw === 'string' && raw.length > 0 ? [raw] : [];
}

function hostedEntrypoint(projectRoot, target, routeName) {
    if (target === 'vercel') {
        return join(projectRoot, 'dist', 'functions', '__zenith', `${routeName}.func`, 'index.js');
    }
    return join(projectRoot, 'dist', 'functions', `__zenith_${routeName}.mjs`);
}

function hostedInternalUrl(target, routeName) {
    if (target === 'vercel') {
        return `https://example.com/__zenith/${routeName}`;
    }
    return `https://example.com/.netlify/functions/__zenith_${routeName}`;
}

async function executeHostedRoute(projectRoot, target, routeName, init = {}) {
    const mod = await import(pathToFileURL(hostedEntrypoint(projectRoot, target, routeName)).href);
    const request = new Request(hostedInternalUrl(target, routeName), {
        redirect: 'manual',
        ...init
    });
    if (target === 'vercel') {
        return mod.default.fetch(request);
    }
    return mod.default(request);
}

describe('route-local middleware parity', () => {
    const previousSecret = process.env.ZENITH_SESSION_SECRET;
    let projectRoot = null;
    let server = null;
    let dev = null;

    afterEach(async () => {
        if (dev) {
            dev.close();
            dev = null;
        }
        if (server) {
            server.close();
            server = null;
        }
        if (previousSecret === undefined) {
            delete process.env.ZENITH_SESSION_SECRET;
        } else {
            process.env.ZENITH_SESSION_SECRET = previousSecret;
        }
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            projectRoot = null;
        }
    });

    test('node packaged output executes route-local page and resource middleware', async () => {
        process.env.ZENITH_SESSION_SECRET = 'zenith-batch9-node-secret';
        projectRoot = await createProject(routeLocalMiddlewareFiles('node'));

        await cli(['build'], projectRoot);

        expect(existsSync(join(projectRoot, 'dist', 'server', 'server-middleware.js'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'server', 'routes', 'protected', 'route', 'entry.js'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'server', 'routes', 'api_local', 'route', 'entry.js'))).toBe(true);

        const mod = await import(pathToFileURL(join(projectRoot, 'dist', 'index.js')).href);
        server = await mod.createNodeServer({
            distDir: join(projectRoot, 'dist'),
            port: 0,
            host: '127.0.0.1'
        });
        const origin = `http://127.0.0.1:${server.port}`;

        const deniedPage = await fetch(`${origin}/protected`, { redirect: 'manual' });
        expect(deniedPage.status).toBe(307);
        expect(deniedPage.headers.get('location')).toBe('/login');

        const allowedPage = await fetch(`${origin}/protected`, { headers: { 'x-user': 'node-user' } });
        expect(allowedPage.status).toBe(200);
        expect(extractSsrPayload(await allowedPage.text())).toMatchObject({
            viewer: 'node-user',
            marker: 'seen',
            pathname: '/protected'
        });

        const deniedResource = await fetch(`${origin}/api/local`);
        expect(deniedResource.status).toBe(401);
        expect(await deniedResource.text()).toBe('token required');

        const allowedResource = await fetch(`${origin}/api/local`, {
            headers: { 'x-token': 'ok', 'x-signin': 'yes' }
        });
        expect(allowedResource.status).toBe(200);
        expect(allowedResource.headers.get('content-type')).toBe('application/json; charset=utf-8');
        expect(await allowedResource.json()).toEqual({ ok: true, route: '/api/local' });
        const cookies = getSetCookieValues(allowedResource.headers);
        expect(cookies).toHaveLength(1);
        expect(cookies[0]).toContain('zenith_session=');

        const redirectedResource = await fetch(`${origin}/api/local`, {
            method: 'POST',
            headers: { 'x-token': 'ok' },
            redirect: 'manual'
        });
        expect(redirectedResource.status).toBe(303);
        expect(redirectedResource.headers.get('location')).toBe('/thanks');
    });

    test('dev server executes route-local middleware for page and resource routes', async () => {
        process.env.ZENITH_SESSION_SECRET = 'zenith-batch9-dev-secret';
        projectRoot = await createProject(routeLocalMiddlewareFiles('node'));

        dev = await createDevServer({
            pagesDir: join(projectRoot, 'pages'),
            outDir: join(projectRoot, 'dist'),
            projectRoot,
            port: 0,
            config: { target: 'node', router: true }
        });
        const origin = `http://127.0.0.1:${dev.port}`;

        const deniedPage = await fetch(`${origin}/protected`, { redirect: 'manual' });
        expect(deniedPage.status).toBe(307);
        expect(deniedPage.headers.get('location')).toBe('/login');

        const allowedPage = await fetch(`${origin}/protected`, { headers: { 'x-user': 'dev-user' } });
        expect(allowedPage.status).toBe(200);
        expect(extractSsrPayload(await allowedPage.text())).toMatchObject({
            viewer: 'dev-user',
            marker: 'seen',
            pathname: '/protected'
        });

        const deniedResource = await fetch(`${origin}/api/local`);
        expect(deniedResource.status).toBe(401);
        expect(await deniedResource.text()).toBe('token required');

        const allowedResource = await fetch(`${origin}/api/local`, {
            headers: { 'x-token': 'ok', 'x-signin': 'yes' }
        });
        expect(allowedResource.status).toBe(200);
        expect(await allowedResource.json()).toEqual({ ok: true, route: '/api/local' });
        expect(getSetCookieValues(allowedResource.headers)[0]).toContain('zenith_session=');
    });

    test.each(['vercel', 'netlify'])(
        '%s packaged functions execute route-local page and resource middleware',
        async (target) => {
            process.env.ZENITH_SESSION_SECRET = `zenith-batch9-${target}-secret`;
            projectRoot = await createProject(routeLocalMiddlewareFiles(target));

            await cli(['build'], projectRoot);

            const deniedPage = await executeHostedRoute(projectRoot, target, 'protected');
            expect(deniedPage.status).toBe(307);
            expect(deniedPage.headers.get('location')).toBe('/login');

            const allowedPage = await executeHostedRoute(projectRoot, target, 'protected', {
                headers: { 'x-user': `${target}-user` }
            });
            expect(allowedPage.status).toBe(200);
            expect(extractSsrPayload(await allowedPage.text())).toMatchObject({
                viewer: `${target}-user`,
                marker: 'seen',
                pathname: '/protected'
            });

            const deniedResource = await executeHostedRoute(projectRoot, target, 'api_local');
            expect(deniedResource.status).toBe(401);
            expect(await deniedResource.text()).toBe('token required');

            const allowedResource = await executeHostedRoute(projectRoot, target, 'api_local', {
                headers: { 'x-token': 'ok', 'x-signin': 'yes' }
            });
            expect(allowedResource.status).toBe(200);
            expect(await allowedResource.json()).toEqual({ ok: true, route: '/api/local' });
            expect(getSetCookieValues(allowedResource.headers)[0]).toContain('zenith_session=');
        }
    );

    test('static targets reject route-local middleware server routes instead of implying static support', async () => {
        projectRoot = await createProject(routeLocalMiddlewareFiles('static'));
        await expect(cli(['build'], projectRoot)).rejects.toThrow(
            'target "static" cannot emit server-rendered routes'
        );

        await rm(projectRoot, { recursive: true, force: true });
        projectRoot = await createProject({
            'pages/protected.zen': [
                '<script server lang="ts">',
                "import { withMiddleware } from 'zenith:server-contract';",
                'export const prerender = true;',
                'const requireUser = (next) => async (ctx) => next(ctx);',
                'export const guard = withMiddleware(async (ctx) => ctx.allow(), requireUser);',
                '</script>',
                '<main>Protected</main>'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "static-export" };\n'
        });
        await expect(cli(['build'], projectRoot)).rejects.toThrow(
            'Cannot prerender a static route with a `guard`, `load`, or `action` function.'
        );
    });
});
