import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';
import { cli } from '../dist/index.js';
import { copyHostedGlobalMiddlewareRuntime } from '../dist/adapters/copy-hosted-page-runtime.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(60000);

const INVALID_MODULE_PATH_ERROR = '[Zenith:Middleware] Invalid global middleware module path in server manifest.';
const MISSING_RUNTIME_ERROR = '[Zenith:Middleware] Compiled global middleware runtime is missing from server output.';

async function createProject(target, files = {}) {
    const root = join(tmpdir(), `zenith-global-middleware-hosted-${target}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const projectFiles = {
        ...files,
        'zenith.config.js': `module.exports = { target: ${JSON.stringify(target)} };\n`
    };
    for (const [relativePath, contents] of Object.entries(projectFiles)) {
        const absolutePath = join(root, relativePath);
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

async function writeTempFile(root, relativePath, contents) {
    const absolutePath = join(root, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, 'utf8');
}

function serverPage(label = 'Page') {
    return [
        '<script server lang="ts">',
        'export function guard(ctx) {',
        '  ctx.env.order = Array.isArray(ctx.env.order) ? ctx.env.order : [];',
        '  ctx.env.order.push("guard");',
        '  return ctx.allow();',
        '}',
        'export function load(ctx) {',
        '  ctx.env.order = Array.isArray(ctx.env.order) ? ctx.env.order : [];',
        '  ctx.env.order.push("load");',
        '  return ctx.data({ route: ctx.route.pattern, order: ctx.env.order, helper: ctx.env.helper, contract: ctx.env.contract, routeAuth: ctx.env.routeAuth });',
        '}',
        '</script>',
        `<main>${label}</main>`
    ].join('\n');
}

function hostedFiles() {
    return {
        'pages/home.zen': serverPage('Home'),
        'pages/redirect.zen': serverPage('Redirect'),
        'pages/deny.zen': serverPage('Deny'),
        'pages/authredirect.zen': serverPage('Auth redirect'),
        'pages/authdeny.zen': serverPage('Auth deny'),
        'pages/signin.zen': serverPage('Sign in'),
        'pages/signout.zen': serverPage('Sign out'),
        'pages/invalid.zen': serverPage('Invalid'),
        'pages/signininvalid.zen': serverPage('Sign in invalid'),
        'pages/api/ping.resource.ts': [
            'export function load(ctx) {',
            '  return ctx.json({ route: ctx.route.pattern, order: ctx.env.order, helper: ctx.env.helper, contract: ctx.env.contract, routeAuth: ctx.env.routeAuth });',
            '}'
        ].join('\n'),
        'middleware-helper.ts': [
            'import { allow } from "zenith:server-contract";',
            'export function mark(ctx) {',
            '  ctx.env.helper = "relative";',
            '  ctx.env.contract = typeof allow;',
            '}'
        ].join('\n'),
        'middleware.ts': [
            'import { redirect } from "zenith:server-contract";',
            'import { attachRouteAuth } from "zenith:route-auth";',
            'import { mark } from "./middleware-helper.ts";',
            'export default async function middleware(ctx, next) {',
            '  ctx.env.order = ["middleware"];',
            '  ctx.env.routeAuth = typeof attachRouteAuth;',
            '  mark(ctx);',
            '  if (ctx.url.pathname === "/redirect") return redirect("/login", 307);',
            '  if (ctx.url.pathname === "/deny") return ctx.deny(403, "Denied globally");',
            '  if (ctx.url.pathname === "/authredirect") { await ctx.auth.requireSession({ redirectTo: "/login" }); return next(); }',
            '  if (ctx.url.pathname === "/authdeny") { await ctx.auth.requireSession({ deny: 401, message: "Sign in required" }); return next(); }',
            '  if (ctx.url.pathname === "/signin") { await ctx.auth.signIn({ userId: "u1" }); return ctx.redirect("/dashboard", 303); }',
            '  if (ctx.url.pathname === "/signout") { await ctx.auth.signOut(); return ctx.redirect("/login", 303); }',
            '  if (ctx.url.pathname === "/invalid") return ctx.data({ unsupported: true });',
            '  if (ctx.url.pathname === "/signininvalid") { await ctx.auth.signIn({ userId: "u1" }); return ctx.data({ unsupported: true }); }',
            '  return next();',
            '}'
        ].join('\n'),
        'middleware.js': [
            'export default async function middleware(ctx, next) {',
            '  globalThis.__zenithHostedJsMiddlewareRan = true;',
            '  return next();',
            '}'
        ].join('\n')
    };
}

function hostedEntrypoint(projectRoot, target, routeName) {
    if (target === 'vercel') {
        return join(projectRoot, 'dist', 'functions', '__zenith', `${routeName}.func`, 'index.js');
    }
    return join(projectRoot, 'dist', 'functions', `__zenith_${routeName}.mjs`);
}

function hostedImageEntrypoint(projectRoot, target) {
    if (target === 'vercel') {
        return join(projectRoot, 'dist', 'functions', '__zenith', 'image.func', 'index.js');
    }
    return join(projectRoot, 'dist', 'functions', '__zenith_image.mjs');
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
    return target === 'vercel' ? mod.default.fetch(request) : mod.default(request);
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

function hostedRuntimeRoot(projectRoot, target, routeName = 'home') {
    if (target === 'vercel') {
        return join(projectRoot, 'dist', 'functions', '__zenith', `${routeName}.func`);
    }
    return join(projectRoot, 'dist', 'functions', '_zenith');
}

function middlewareEntryPath(projectRoot, target, routeName = 'home') {
    return join(hostedRuntimeRoot(projectRoot, target, routeName), 'global-middleware', 'entry.js');
}

function middlewareHelperPath(projectRoot, target, routeName = 'home') {
    return join(hostedRuntimeRoot(projectRoot, target, routeName), 'global-middleware', 'modules', 'middleware-helper.js');
}

function expectHostedMiddlewareOutput(projectRoot, target) {
    const entryPath = middlewareEntryPath(projectRoot, target);
    const helperPath = middlewareHelperPath(projectRoot, target);
    expect(existsSync(entryPath)).toBe(true);
    expect(existsSync(helperPath)).toBe(true);
    expect(existsSync(join(hostedRuntimeRoot(projectRoot, target), 'server-contract.js'))).toBe(true);
    expect(existsSync(join(hostedRuntimeRoot(projectRoot, target), 'auth', 'route-auth.js'))).toBe(true);
    expect(existsSync(join(hostedRuntimeRoot(projectRoot, target), 'runtime', 'route-render.js'))).toBe(true);
}

describe('global middleware hosted runtime parity', () => {
    const previousSecret = process.env.ZENITH_SESSION_SECRET;
    let projectRoot = null;

    afterEach(async () => {
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

    test.each(['vercel', 'netlify'])('%s executes global middleware in hosted page/resource functions', async (target) => {
        process.env.ZENITH_SESSION_SECRET = `zenith-hosted-${target}-secret`;
        projectRoot = await createProject(target, hostedFiles());

        await cli(['build'], projectRoot);
        expectHostedMiddlewareOutput(projectRoot, target);

        const entrySource = await readFile(middlewareEntryPath(projectRoot, target), 'utf8');
        expect(entrySource).toContain('../server-contract.js');
        expect(entrySource).toContain('../auth/route-auth.js');
        expect(entrySource).toContain('./modules/middleware-helper.js');

        const helperSource = await readFile(middlewareHelperPath(projectRoot, target), 'utf8');
        expect(helperSource).toContain('server-contract.js');

        const homeSource = await readFile(hostedEntrypoint(projectRoot, target, 'home'), 'utf8');
        expect(homeSource).toContain('globalMiddlewareModulePath');
        expect(homeSource).toContain(target === 'vercel'
            ? "join(__dirname, 'global-middleware', 'entry.js')"
            : "join(__dirname, '_zenith', 'global-middleware', 'entry.js')");

        const imageSource = await readFile(hostedImageEntrypoint(projectRoot, target), 'utf8');
        expect(imageSource).not.toContain('globalMiddlewareModulePath');
        expect(imageSource).not.toContain('global-middleware');
        if (target === 'vercel') {
            expect(existsSync(join(projectRoot, 'dist', 'functions', '__zenith', 'image.func', 'global-middleware'))).toBe(false);
        } else {
            expect(existsSync(join(projectRoot, 'dist', 'functions', 'global-middleware'))).toBe(false);
        }

        const home = await executeHostedRoute(projectRoot, target, 'home');
        expect(home.status).toBe(200);
        expect(extractSsrPayload(await home.text())).toEqual({
            route: '/home',
            order: ['middleware', 'guard', 'load'],
            helper: 'relative',
            contract: 'function',
            routeAuth: 'function'
        });

        const resource = await executeHostedRoute(projectRoot, target, 'api_ping');
        expect(resource.status).toBe(200);
        expect(await resource.json()).toEqual({
            route: '/api/ping',
            order: ['middleware'],
            helper: 'relative',
            contract: 'function',
            routeAuth: 'function'
        });

        const redirected = await executeHostedRoute(projectRoot, target, 'redirect');
        expect(redirected.status).toBe(307);
        expect(redirected.headers.get('location')).toBe('/login');

        const denied = await executeHostedRoute(projectRoot, target, 'deny');
        expect(denied.status).toBe(403);
        expect(await denied.text()).toBe('Denied globally');

        const authRedirect = await executeHostedRoute(projectRoot, target, 'authredirect');
        expect(authRedirect.status).toBe(302);
        expect(authRedirect.headers.get('location')).toBe('/login');

        const authDeny = await executeHostedRoute(projectRoot, target, 'authdeny');
        expect(authDeny.status).toBe(401);
        expect(await authDeny.text()).toBe('Sign in required');

        const signIn = await executeHostedRoute(projectRoot, target, 'signin');
        expect(signIn.status).toBe(303);
        expect(signIn.headers.get('location')).toBe('/dashboard');
        expect(getSetCookieValues(signIn.headers)).toHaveLength(1);

        const signOut = await executeHostedRoute(projectRoot, target, 'signout');
        expect(signOut.status).toBe(303);
        expect(signOut.headers.get('location')).toBe('/login');
        expect(getSetCookieValues(signOut.headers)[0]).toContain('Max-Age=0');

        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const invalid = await executeHostedRoute(projectRoot, target, 'invalid');
            expect(invalid.status).toBe(500);
            expect(await invalid.text()).toBe('Internal Server Error');
            expect(getSetCookieValues(invalid.headers)).toHaveLength(0);

            const signInInvalid = await executeHostedRoute(projectRoot, target, 'signininvalid');
            expect(signInInvalid.status).toBe(500);
            expect(await signInInvalid.text()).toBe('Internal Server Error');
            expect(getSetCookieValues(signInInvalid.headers)).toHaveLength(0);
        } finally {
            errorSpy.mockRestore();
        }
    });

    test.each(['vercel', 'netlify'])('%s omits hosted middleware output when no global middleware is discovered', async (target) => {
        projectRoot = await createProject(target, {
            'pages/home.zen': serverPage('Home without middleware'),
            'middleware.js': 'export default function middleware() { throw new Error("ignored js middleware"); }\n'
        });

        await cli(['build'], projectRoot);

        expect(existsSync(join(hostedRuntimeRoot(projectRoot, target), 'global-middleware'))).toBe(false);
        expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'global-middleware'))).toBe(false);

        const homeSource = await readFile(hostedEntrypoint(projectRoot, target, 'home'), 'utf8');
        expect(homeSource).toContain('const globalMiddlewareModulePath = null;');

        const imageSource = await readFile(hostedImageEntrypoint(projectRoot, target), 'utf8');
        expect(imageSource).not.toContain('globalMiddlewareModulePath');
        expect(imageSource).not.toContain('global-middleware');

        const home = await executeHostedRoute(projectRoot, target, 'home');
        expect(home.status).toBe(200);
        expect(extractSsrPayload(await home.text())).toEqual({
            route: '/home',
            order: ['guard', 'load']
        });
        expect(globalThis.__zenithHostedJsMiddlewareRan).toBeUndefined();
    });

    test.each(['vercel', 'netlify'])('%s invalid compiled middleware default export uses hosted 500 path', async (target) => {
        projectRoot = await createProject(target, {
            'pages/home.zen': serverPage('Invalid default'),
            'middleware.ts': 'export default async function middleware(ctx, next) { return next(); }\n'
        });

        await cli(['build'], projectRoot);
        await writeFile(middlewareEntryPath(projectRoot, target), 'export default {};\n', 'utf8');

        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const response = await executeHostedRoute(projectRoot, target, 'home');
            expect(response.status).toBe(500);
            expect(await response.text()).toBe('Internal Server Error');
            expect(errorSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain(
                '[Zenith:Middleware] Compiled global middleware module must default export a function.'
            );
        } finally {
            errorSpy.mockRestore();
        }
    });

    test('hosted global middleware copy helper rejects unsafe or missing manifest modules', async () => {
        const root = join(tmpdir(), `zenith-hosted-middleware-helper-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        try {
            await writeTempFile(root, 'server/manifest.json', JSON.stringify({
                global_middleware: { module: '../escape.js' }
            }));
            await expect(copyHostedGlobalMiddlewareRuntime(root, join(root, 'hosted'))).rejects.toThrow(INVALID_MODULE_PATH_ERROR);

            await writeTempFile(root, 'server/manifest.json', JSON.stringify({
                global_middleware: { module: 'global-middleware/../global-middleware/entry.js' }
            }));
            await expect(copyHostedGlobalMiddlewareRuntime(root, join(root, 'hosted'))).rejects.toThrow(INVALID_MODULE_PATH_ERROR);

            await writeTempFile(root, 'server/manifest.json', JSON.stringify({
                global_middleware: { module: '/tmp/escape.js' }
            }));
            await expect(copyHostedGlobalMiddlewareRuntime(root, join(root, 'hosted'))).rejects.toThrow(INVALID_MODULE_PATH_ERROR);

            await writeTempFile(root, 'server/manifest.json', JSON.stringify({
                global_middleware: { module: 'routes/index/entry.js' }
            }));
            await expect(copyHostedGlobalMiddlewareRuntime(root, join(root, 'hosted'))).rejects.toThrow(INVALID_MODULE_PATH_ERROR);

            await writeTempFile(root, 'server/manifest.json', JSON.stringify({
                global_middleware: { module: 'global-middleware/entry.js' }
            }));
            await expect(copyHostedGlobalMiddlewareRuntime(root, join(root, 'hosted'))).rejects.toThrow(MISSING_RUNTIME_ERROR);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
