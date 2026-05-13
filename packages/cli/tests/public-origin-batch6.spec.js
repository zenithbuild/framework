import { mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

async function createProject() {
    const root = join(tmpdir(), `zenith-public-origin-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const files = {
        'pages/api/login.resource.ts': [
            'export async function action(ctx) {',
            '  await ctx.auth.signIn({ userId: "user_1" });',
            '  return ctx.json({ origin: ctx.url.origin, protocol: ctx.url.protocol });',
            '}'
        ].join('\n'),
        'pages/api/logout.resource.ts': [
            'export async function action(ctx) {',
            '  await ctx.auth.signOut();',
            '  return ctx.json({ origin: ctx.url.origin, protocol: ctx.url.protocol });',
            '}'
        ].join('\n'),
        'zenith.config.js': 'module.exports = { target: "node" };\n'
    };

    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    await cli(['build'], root);
    return root;
}

async function loadNodeModule(projectRoot) {
    return import(pathToFileURL(join(projectRoot, 'dist', 'index.js')).href);
}

function setCookieValues(headers) {
    const raw = headers?.['set-cookie'];
    return Array.isArray(raw) ? raw : (raw ? [String(raw)] : []);
}

function cookiePair(setCookie) {
    return String(setCookie || '').split(';', 1)[0];
}

async function requestExchange(port, pathname, options = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: pathname,
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body
                });
            });
        });
        req.on('error', reject);
        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

async function startHandler(handler) {
    const server = http.createServer((req, res) => {
        void handler(req, res);
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({
                server,
                port: address && typeof address === 'object' ? address.port : 0,
                close: () => server.close()
            });
        });
    });
}

describe('Batch 6 packaged node public origin', () => {
    const previousSecret = process.env.ZENITH_SESSION_SECRET;
    const previousPublicOrigin = process.env.ZENITH_PUBLIC_ORIGIN;
    let projectRoot = null;
    let server = null;

    beforeEach(() => {
        process.env.ZENITH_SESSION_SECRET = 'zenith-public-origin-secret';
        delete process.env.ZENITH_PUBLIC_ORIGIN;
    });

    afterEach(async () => {
        if (server) {
            server.close();
            server = null;
        }
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            projectRoot = null;
        }
        if (previousSecret === undefined) {
            delete process.env.ZENITH_SESSION_SECRET;
        } else {
            process.env.ZENITH_SESSION_SECRET = previousSecret;
        }
        if (previousPublicOrigin === undefined) {
            delete process.env.ZENITH_PUBLIC_ORIGIN;
        } else {
            process.env.ZENITH_PUBLIC_ORIGIN = previousPublicOrigin;
        }
    });

    test('ZENITH_PUBLIC_ORIGIN=https marks sign-in and sign-out cookies Secure', async () => {
        projectRoot = await createProject();
        process.env.ZENITH_PUBLIC_ORIGIN = 'https://app.example.test';
        const mod = await loadNodeModule(projectRoot);

        server = await mod.createNodeServer({
            distDir: join(projectRoot, 'dist'),
            port: 0,
            host: '127.0.0.1'
        });

        const login = await requestExchange(server.port, '/api/login', { method: 'POST' });
        expect(login.status).toBe(200);
        expect(JSON.parse(login.body)).toEqual({
            origin: 'https://app.example.test',
            protocol: 'https:'
        });
        const [loginCookie] = setCookieValues(login.headers);
        expect(loginCookie).toContain('; Secure');

        const logout = await requestExchange(server.port, '/api/logout', {
            method: 'POST',
            headers: { cookie: cookiePair(loginCookie) }
        });
        expect(logout.status).toBe(200);
        const [logoutCookie] = setCookieValues(logout.headers);
        expect(logoutCookie).toContain('Max-Age=0');
        expect(logoutCookie).toContain('; Secure');
    });

    test('local HTTP packaged node keeps session cookies non-Secure', async () => {
        projectRoot = await createProject();
        const mod = await loadNodeModule(projectRoot);

        server = await mod.createNodeServer({
            distDir: join(projectRoot, 'dist'),
            port: 0,
            host: '127.0.0.1'
        });

        const login = await requestExchange(server.port, '/api/login', { method: 'POST' });
        expect(login.status).toBe(200);
        expect(JSON.parse(login.body).protocol).toBe('http:');
        const [loginCookie] = setCookieValues(login.headers);
        expect(loginCookie).not.toContain('; Secure');
    });

    test('invalid ZENITH_PUBLIC_ORIGIN fails safely before serving', async () => {
        projectRoot = await createProject();
        process.env.ZENITH_PUBLIC_ORIGIN = 'https://app.example.test/path';
        const mod = await loadNodeModule(projectRoot);

        await expect(mod.createNodeServer({
            distDir: join(projectRoot, 'dist'),
            port: 0,
            host: '127.0.0.1'
        })).rejects.toThrow('must not include a path, query, or hash');
    });

    test('createRequestHandler publicOrigin option uses trusted HTTPS origin', async () => {
        projectRoot = await createProject();
        const mod = await loadNodeModule(projectRoot);
        const handler = await mod.createRequestHandler({
            distDir: join(projectRoot, 'dist'),
            publicOrigin: 'https://handler.example.test'
        });
        server = await startHandler(handler);

        const login = await requestExchange(server.port, '/api/login', { method: 'POST' });
        expect(login.status).toBe(200);
        expect(JSON.parse(login.body)).toEqual({
            origin: 'https://handler.example.test',
            protocol: 'https:'
        });
        const [loginCookie] = setCookieValues(login.headers);
        expect(loginCookie).toContain('; Secure');
    });
});
