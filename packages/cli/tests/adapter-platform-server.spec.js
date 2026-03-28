import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

async function createProject(files) {
    const root = join(tmpdir(), `zenith-platform-server-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

describe('platform server adapters', () => {
    let projectRoot = null;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
            projectRoot = null;
        }
    });

    test('vercel target emits server functions ahead of filesystem routes and packaged server output', async () => {
        projectRoot = await createProject({
            'pages/account/index.zen': [
                '<script server lang="ts">',
                'export const data = { viewer: "admin" };',
                '</script>',
                '<main>{data.viewer}</main>'
            ].join('\n'),
            'pages/users/[id].zen': '<main>{params.id}</main>\n',
            'zenith.config.js': 'module.exports = { target: "vercel" };\n'
        });

        await cli(['build'], projectRoot);

        const config = await readJson(join(projectRoot, 'dist', 'config.json'));
        expect(config.routes[0]).toMatchObject({
            src: '^/account/?$',
            dest: '/__zenith/account'
        });
        expect(config.routes[1]).toMatchObject({ handle: 'filesystem' });
        expect(existsSync(join(projectRoot, 'dist', 'functions', '__zenith', 'account.func', 'index.js'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'functions', '__zenith', 'account.func', 'route', 'entry.js'))).toBe(true);
        expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'manifest.json'))).toBe(true);

        const mod = await import(pathToFileURL(join(projectRoot, 'dist', 'functions', '__zenith', 'account.func', 'index.js')).href);
        const response = await mod.default.fetch(new Request('https://example.com/__zenith/account'));
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(body).toContain('"viewer":"admin"');
    });

    test('vercel packaged functions preserve empty, deny, and thrown-error server response contracts', async () => {
        projectRoot = await createProject({
            'pages/empty/index.zen': [
                '<script server lang="ts">',
                'const noop = 1;',
                '</script>',
                '<main>empty</main>'
            ].join('\n'),
            'pages/records/[id].zen': [
                '<script server lang="ts">',
                'export async function load(ctx) {',
                '  if (ctx.params.id === "missing") return ctx.deny(404, "Record not found");',
                '  if (ctx.params.id === "explode") throw new Error("Route exploded");',
                '  return ctx.data({ id: ctx.params.id });',
                '}',
                '</script>',
                '<main>record</main>'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "vercel" };\n'
        });

        await cli(['build'], projectRoot);

        const emptyMod = await import(pathToFileURL(join(
            projectRoot,
            'dist',
            'functions',
            '__zenith',
            'empty.func',
            'index.js'
        )).href);
        const emptyResponse = await emptyMod.default.fetch(new Request('https://example.com/__zenith/empty'));
        const emptyBody = await emptyResponse.text();
        expect(emptyResponse.status).toBe(200);
        expect(emptyBody).toContain('window.__zenith_ssr_data = {};');

        const recordsMod = await import(pathToFileURL(join(
            projectRoot,
            'dist',
            'functions',
            '__zenith',
            'records_param_id.func',
            'index.js'
        )).href);

        const allowed = await recordsMod.default.fetch(new Request(
            'https://example.com/__zenith/records_param_id?__zenith_param_id=42'
        ));
        expect(allowed.status).toBe(200);
        expect(await allowed.text()).toContain('"id":"42"');

        const denied = await recordsMod.default.fetch(new Request(
            'https://example.com/__zenith/records_param_id?__zenith_param_id=missing'
        ));
        expect(denied.status).toBe(404);
        expect(await denied.text()).toBe('Record not found');

        const failed = await recordsMod.default.fetch(new Request(
            'https://example.com/__zenith/records_param_id?__zenith_param_id=explode'
        ));
        expect(failed.status).toBe(500);
        expect(await failed.text()).toBe('Internal Server Error');
    });

    test('netlify target emits publish/functions layout and packaged function can execute adjacent load modules', async () => {
        projectRoot = await createProject({
            'pages/secure/index.zen': '<main>secure</main>\n',
            'pages/secure/page.guard.ts': [
                'export async function guard(ctx) {',
                '  if (ctx.url.searchParams.get("auth") !== "yes") return ctx.redirect("/login", 307);',
                '  ctx.env.viewer = "allowed";',
                '  return ctx.allow();',
                '}'
            ].join('\n'),
            'pages/secure/page.load.ts': [
                'export async function load(ctx) {',
                '  return ctx.data({ viewer: ctx.env.viewer, tab: ctx.url.searchParams.get("tab") });',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "netlify" };\n'
        });

        await cli(['build'], projectRoot);

        const redirects = await readFile(join(projectRoot, 'dist', 'publish', '_redirects'), 'utf8');
        expect(redirects).toContain('/secure /.netlify/functions/__zenith_secure 200!');
        expect(existsSync(join(projectRoot, 'dist', 'functions', '__zenith_secure.mjs'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'functions', '_zenith', 'routes', 'secure', 'route', 'entry.js'))).toBe(true);
        expect(await readFile(join(projectRoot, 'dist', 'netlify.toml'), 'utf8')).toContain('publish = "publish"');

        const mod = await import(pathToFileURL(join(projectRoot, 'dist', 'functions', '__zenith_secure.mjs')).href);
        const allowed = await mod.default(new Request(
            'https://example.com/.netlify/functions/__zenith_secure?auth=yes&tab=profile'
        ));
        const allowedBody = await allowed.text();
        expect(allowed.status).toBe(200);
        expect(allowedBody).toContain('"viewer":"allowed"');
        expect(allowedBody).toContain('"tab":"profile"');

        const denied = await mod.default(new Request(
            'https://example.com/.netlify/functions/__zenith_secure?auth=no'
        ));
        expect(denied.status).toBe(307);
        expect(denied.headers.get('location')).toBe('/login');
        expect(await denied.text()).toBe('');
    });

    test('server deployment adapters preserve basePath in public route mappings and redirects', async () => {
        projectRoot = await createProject({
            'pages/account/index.zen': [
                '<script server lang="ts">',
                'export async function guard(ctx) {',
                '  if (ctx.url.searchParams.get("auth") !== "yes") return ctx.redirect("/login", 307);',
                '  return ctx.allow();',
                '}',
                'export async function load(ctx) {',
                '  return ctx.data({ pathname: ctx.url.pathname });',
                '}',
                '</script>',
                '<main>account</main>'
            ].join('\n'),
            'pages/guides/[slug].zen': '<main>{params.slug}</main>\n',
            'zenith.config.js': 'module.exports = { target: "vercel", basePath: "/docs" };\n'
        });

        await cli(['build'], projectRoot);

        const vercelConfig = await readJson(join(projectRoot, 'dist', 'config.json'));
        expect(vercelConfig.routes).toEqual(expect.arrayContaining([
            { src: '^/docs/assets/(.+)$', dest: '/assets/$1' },
            { src: '^/docs/account/?$', dest: '/__zenith/account' },
            { handle: 'filesystem' },
            { src: '^/docs/guides/([^/]+)/?$', dest: '/guides/__param_slug/index.html' }
        ]));

        const mod = await import(pathToFileURL(join(projectRoot, 'dist', 'functions', '__zenith', 'account.func', 'index.js')).href);
        const denied = await mod.default.fetch(new Request('https://example.com/__zenith/account?auth=no'));
        expect(denied.status).toBe(307);
        expect(denied.headers.get('location')).toBe('/docs/login');

        const allowed = await mod.default.fetch(new Request('https://example.com/__zenith/account?auth=yes'));
        expect(await allowed.text()).toContain('"pathname":"\\u002Fdocs\\u002Faccount"');

        await rm(join(projectRoot, 'dist'), { recursive: true, force: true });
        await writeFile(
            join(projectRoot, 'zenith.config.js'),
            'module.exports = { target: "netlify", basePath: "/docs" };\n',
            'utf8'
        );

        await cli(['build'], projectRoot);

        const redirects = await readFile(join(projectRoot, 'dist', 'publish', '_redirects'), 'utf8');
        expect(redirects).toContain('/docs/assets/* /assets/:splat 200');
        expect(redirects).toContain('/docs/account /.netlify/functions/__zenith_account 200!');
        expect(redirects).toContain('/docs/guides/:slug /guides/__param_slug/index.html 200');

        const netlifyMod = await import(pathToFileURL(join(projectRoot, 'dist', 'functions', '__zenith_account.mjs')).href);
        const netlifyDenied = await netlifyMod.default(new Request('https://example.com/.netlify/functions/__zenith_account?auth=no'));
        expect(netlifyDenied.status).toBe(307);
        expect(netlifyDenied.headers.get('location')).toBe('/docs/login');
    });
});
