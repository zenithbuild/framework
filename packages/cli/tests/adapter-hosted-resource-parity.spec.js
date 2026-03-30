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

function resourcePages() {
    return {
        'pages/api/ping.resource.ts': [
            'export async function load(ctx) {',
            '  return ctx.json({ method: ctx.method, route: ctx.route.pattern });',
            '}'
        ].join('\n'),
        'pages/api/submit.resource.ts': [
            'export async function action(ctx) {',
            '  const form = await ctx.request.formData();',
            '  const name = String(form.get("name") || "").trim();',
            '  return ctx.json({ ok: true, name });',
            '}'
        ].join('\n'),
        'pages/api/health.resource.ts': [
            'export async function load(ctx) {',
            '  return ctx.text("healthy");',
            '}'
        ].join('\n'),
        'pages/api/bounce.resource.ts': [
            'export async function load(ctx) {',
            '  return ctx.redirect("/login", 307);',
            '}'
        ].join('\n'),
        'pages/api/deny.resource.ts': [
            'export async function load(ctx) {',
            '  return ctx.deny(401, "Login required");',
            '}'
        ].join('\n'),
        'pages/api/login.resource.ts': [
            'export async function action(ctx) {',
            '  const form = await ctx.request.formData();',
            '  const username = String(form.get("username") || "").trim();',
            '  await ctx.auth.signIn({ username });',
            '  return ctx.json({ ok: true, username });',
            '}'
        ].join('\n'),
        'pages/api/me.resource.ts': [
            'export async function guard(ctx) {',
            '  await ctx.auth.requireSession({ deny: 401, message: "Login required" });',
            '  return ctx.allow();',
            '}',
            'export async function load(ctx) {',
            '  return ctx.json({ session: await ctx.auth.getSession() });',
            '}'
        ].join('\n'),
        'pages/api/logout.resource.ts': [
            'export async function action(ctx) {',
            '  await ctx.auth.signOut();',
            '  return ctx.text("signed out");',
            '}'
        ].join('\n')
    };
}

async function createProject(target, files) {
    const root = join(tmpdir(), `zenith-hosted-resource-${target}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const projectFiles = {
        ...files,
        'zenith.config.js': `module.exports = { target: ${JSON.stringify(target)} };\n`
    };

    for (const [relativePath, contents] of Object.entries(projectFiles)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }

    return root;
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

describe('hosted resource route parity', () => {
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
        '%s supports hosted resource json/text/redirect/deny and auth-cookie parity',
        async (target) => {
            process.env.ZENITH_SESSION_SECRET = `zenith-${target}-resource-secret`;
            projectRoot = await createProject(target, resourcePages());

            await cli(['build'], projectRoot);

            const ping = await executeHostedRoute(projectRoot, target, 'api_ping');
            expect(ping.status).toBe(200);
            expect(await ping.json()).toEqual({ method: 'GET', route: '/api/ping' });

            const submit = await executeHostedRoute(projectRoot, target, 'api_submit', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'name=hosted-user'
            });
            expect(submit.status).toBe(200);
            expect(await submit.json()).toEqual({ ok: true, name: 'hosted-user' });

            const health = await executeHostedRoute(projectRoot, target, 'api_health');
            expect(health.status).toBe(200);
            expect(await health.text()).toBe('healthy');

            const bounce = await executeHostedRoute(projectRoot, target, 'api_bounce');
            expect(bounce.status).toBe(307);
            expect(bounce.headers.get('location')).toBe('/login');

            const denied = await executeHostedRoute(projectRoot, target, 'api_deny');
            expect(denied.status).toBe(401);
            expect(await denied.text()).toBe('Login required');

            const missing = await executeHostedRoute(projectRoot, target, 'api_me');
            expect(missing.status).toBe(401);
            expect(await missing.text()).toBe('Login required');

            const login = await executeHostedRoute(projectRoot, target, 'api_login', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'username=hosted-user'
            });
            expect(login.status).toBe(200);
            expect(await login.json()).toEqual({ ok: true, username: 'hosted-user' });

            const loginSetCookies = getSetCookieValues(login.headers);
            expect(loginSetCookies).toHaveLength(1);
            expect(loginSetCookies[0]).toContain('zenith_session=');

            const sessionCookie = cookieHeaderFromSetCookie(loginSetCookies[0]);
            const me = await executeHostedRoute(projectRoot, target, 'api_me', {
                headers: { cookie: sessionCookie }
            });
            expect(me.status).toBe(200);
            expect(await me.json()).toEqual({ session: { username: 'hosted-user' } });

            const logout = await executeHostedRoute(projectRoot, target, 'api_logout', {
                method: 'POST',
                headers: { cookie: sessionCookie }
            });
            expect(logout.status).toBe(200);
            expect(await logout.text()).toBe('signed out');

            const logoutSetCookies = getSetCookieValues(logout.headers);
            expect(logoutSetCookies).toHaveLength(1);
            expect(logoutSetCookies[0]).toContain('Max-Age=0');

            const clearedCookie = cookieHeaderFromSetCookie(logoutSetCookies[0]);
            const afterLogout = await executeHostedRoute(projectRoot, target, 'api_me', {
                headers: { cookie: clearedCookie }
            });
            expect(afterLogout.status).toBe(401);
            expect(await afterLogout.text()).toBe('Login required');
        }
    );

    test.each(['vercel', 'netlify'])(
        '%s keeps hosted resource downloads deferred at build time',
        async (target) => {
            projectRoot = await createProject(target, {
                'pages/api/export.resource.ts': [
                    'export async function load(ctx) {',
                    '  return ctx.download("blocked", { filename: "blocked.txt" });',
                    '}'
                ].join('\n')
            });

            await expect(cli(['build'], projectRoot)).rejects.toThrow(
                `target "${target}" does not support resource downloads in this milestone`
            );
        }
    );

    test.each(['vercel', 'netlify'])(
        '%s keeps hosted multipart resource writes deferred at runtime',
        async (target) => {
            projectRoot = await createProject(target, {
                'pages/api/upload.resource.ts': [
                    'export async function action(ctx) {',
                    '  const form = await ctx.request.formData();',
                    '  return ctx.json({ title: String(form.get("title") || "").trim() });',
                    '}'
                ].join('\n')
            });

            await cli(['build'], projectRoot);

            const form = new FormData();
            form.set('title', 'Deferred upload');
            form.set('attachment', new File(['blocked'], 'blocked.txt', { type: 'text/plain' }));

            const response = await executeHostedRoute(projectRoot, target, 'api_upload', {
                method: 'POST',
                body: form
            });
            expect(response.status).toBe(501);
            expect(await response.text()).toBe('Hosted multipart resource routes are unsupported in this milestone');
        }
    );
});
