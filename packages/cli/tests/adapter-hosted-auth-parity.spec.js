import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(30000);

function authPages() {
    return {
        'pages/login.zen': [
            '<script server lang="ts">',
            'export async function action(ctx) {',
            '  const form = await ctx.request.formData();',
            '  const email = String(form.get("email") || "").trim();',
            '  if (!email) return ctx.invalid({ field: "email", message: "Email required" }, 422);',
            '  await ctx.auth.signIn({ userId: "user_1", email, stage: "first" });',
            '  await ctx.auth.signIn({ userId: "user_1", email, stage: "final" });',
            '  return ctx.redirect("/account", 303);',
            '}',
            '</script>',
            '<html><head></head><body><main>Login</main></body></html>'
        ].join('\n'),
        'pages/account.zen': [
            '<script server lang="ts">',
            'export async function guard(ctx) {',
            '  const session = await ctx.auth.requireSession({ redirectTo: "/login", status: 302 });',
            '  ctx.env.viewer = String(session.email || "");',
            '  return ctx.allow();',
            '}',
            'export async function load(ctx) {',
            '  return ctx.data({ viewer: ctx.env.viewer, session: await ctx.auth.getSession(), action: ctx.action });',
            '}',
            '</script>',
            '<html><head></head><body><main>Account</main></body></html>'
        ].join('\n'),
        'pages/logout.zen': [
            '<script server lang="ts">',
            'export async function action(ctx) {',
            '  await ctx.auth.signOut();',
            '  return ctx.redirect("/login", 303);',
            '}',
            '</script>',
            '<html><head></head><body><main>Logout</main></body></html>'
        ].join('\n')
    };
}

async function createProject(target) {
    const root = join(tmpdir(), `zenith-hosted-auth-${target}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const files = {
        ...authPages(),
        'zenith.config.js': `module.exports = { target: ${JSON.stringify(target)} };\n`
    };

    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }

    return root;
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

function cookieHeaderFromSetCookie(setCookieValue) {
    expect(typeof setCookieValue).toBe('string');
    return String(setCookieValue).split(';', 1)[0];
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
    const entryPath = hostedEntrypoint(projectRoot, target, routeName);
    const mod = await import(pathToFileURL(entryPath).href);
    const request = new Request(hostedInternalUrl(target, routeName), {
        redirect: 'manual',
        ...init
    });
    if (target === 'vercel') {
        return mod.default.fetch(request);
    }
    return mod.default(request);
}

describe('hosted page-route cookie session parity', () => {
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

    test.each(['vercel', 'netlify'])(
        '%s preserves page-route sign-in, redirect Set-Cookie, guarded reads, and sign-out',
        async (target) => {
            process.env.ZENITH_SESSION_SECRET = `zenith-${target}-session-secret`;
            projectRoot = await createProject(target);

            await cli(['build'], projectRoot);

            const missing = await executeHostedRoute(projectRoot, target, 'account');
            expect(missing.status).toBe(302);
            expect(missing.headers.get('location')).toBe('/login');

            const login = await executeHostedRoute(projectRoot, target, 'login', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'email=ada%40zenith.dev'
            });
            expect(login.status).toBe(303);
            expect(login.headers.get('location')).toBe('/account');

            const loginSetCookies = getSetCookieValues(login.headers);
            expect(loginSetCookies).toHaveLength(2);
            expect(loginSetCookies[0]).toContain('zenith_session=');
            expect(loginSetCookies[1]).toContain('zenith_session=');

            const sessionCookie = cookieHeaderFromSetCookie(loginSetCookies[1]);
            const account = await executeHostedRoute(projectRoot, target, 'account', {
                headers: { cookie: sessionCookie }
            });
            expect(account.status).toBe(200);
            expect(extractSsrPayload(await account.text())).toEqual({
                viewer: 'ada@zenith.dev',
                session: {
                    userId: 'user_1',
                    email: 'ada@zenith.dev',
                    stage: 'final'
                },
                action: null
            });

            const logout = await executeHostedRoute(projectRoot, target, 'logout', {
                method: 'POST',
                headers: { cookie: sessionCookie }
            });
            expect(logout.status).toBe(303);
            expect(logout.headers.get('location')).toBe('/login');

            const logoutSetCookies = getSetCookieValues(logout.headers);
            expect(logoutSetCookies).toHaveLength(1);
            expect(logoutSetCookies[0]).toContain('Max-Age=0');

            const clearedCookie = cookieHeaderFromSetCookie(logoutSetCookies[0]);
            const afterLogout = await executeHostedRoute(projectRoot, target, 'account', {
                headers: { cookie: clearedCookie }
            });
            expect(afterLogout.status).toBe(302);
            expect(afterLogout.headers.get('location')).toBe('/login');
        }
    );
});
