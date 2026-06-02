import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { SourceTextModule, createContext } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';
import { build } from '../dist/build.js';
import { createDevServer } from '../dist/dev-server.js';
import { createPreviewServer } from '../dist/preview.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(90000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures', 'scoped-server-data');
const require = createRequire(import.meta.url);
const JEST_JSDOM_DIR = dirname(require.resolve('jest-environment-jsdom/package.json'));
const { JSDOM } = require(require.resolve('jsdom', { paths: [JEST_JSDOM_DIR] }));

async function createFixtureProject(fixtureName) {
    const root = await mkdtemp(join(tmpdir(), `zenith-scoped-closeout-${fixtureName}-`));
    await cp(join(FIXTURES_DIR, fixtureName), root, { recursive: true });
    return {
        root,
        pagesDir: join(root, 'src', 'pages'),
        outDir: join(root, 'dist'),
        devOutDir: join(root, 'dev-dist')
    };
}

async function startTargets(project) {
    const config = { target: 'node', router: true };
    await build({
        pagesDir: project.pagesDir,
        outDir: project.outDir,
        projectRoot: project.root,
        config
    });
    const nodeModule = await import(pathToFileURL(join(project.outDir, 'index.js')).href);
    const node = await nodeModule.createNodeServer({ distDir: project.outDir, port: 0, host: '127.0.0.1' });
    const dev = await createDevServer({
        pagesDir: project.pagesDir,
        outDir: project.devOutDir,
        projectRoot: project.root,
        port: 0,
        config
    });
    const preview = await createPreviewServer({
        distDir: join(project.outDir, 'static'),
        projectRoot: project.root,
        port: 0,
        config
    });
    return [
        { name: 'node', server: node, origin: `http://127.0.0.1:${node.port}` },
        { name: 'dev', server: dev, origin: `http://127.0.0.1:${dev.port}` },
        { name: 'preview', server: preview, origin: `http://127.0.0.1:${preview.port}` }
    ];
}

async function fetchText(origin, path) {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
    return {
        status: response.status,
        headers: response.headers,
        body: await response.text()
    };
}

function extractSsrPayload(html) {
    const matches = html.match(/id="zenith-ssr-data"/g);
    expect(matches).toBeTruthy();
    expect(matches.length).toBe(1);
    const match = html.match(/window\.__zenith_ssr_data\s*=\s*(\{[\s\S]*?\});/);
    expect(match).toBeTruthy();
    return JSON.parse(String(match[1]));
}

async function readTextFiles(root) {
    const out = [];
    async function walk(dir) {
        let entries = [];
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
                continue;
            }
            out.push({
                path: fullPath,
                source: await readFile(fullPath, 'utf8')
            });
        }
    }
    await walk(root);
    return out;
}

function stripDoctype(html) {
    return html.replace(/^<!doctype[^>]*>/i, '');
}

async function extractPageAssetPath(html, staticDir) {
    let assetSrc = '';
    try {
        const routerManifest = JSON.parse(await readFile(join(staticDir, 'assets', 'router-manifest.json'), 'utf8'));
        const route = Array.isArray(routerManifest.routes)
            ? routerManifest.routes.find((entry) => entry.path === '/') || routerManifest.routes[0]
            : null;
        assetSrc = typeof route?.page_asset === 'string' ? route.page_asset : '';
    } catch {
        assetSrc = '';
    }
    if (assetSrc) {
        return join(staticDir, assetSrc.replace(/^\//, ''));
    }

    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
    const pageScript = scripts.find((script) => /\bdata-zx-page\b/.test(script)) || scripts[0] || '';
    const match = pageScript.match(/src=["']([^"']+\.js)["']/);
    expect(match).toBeTruthy();
    return join(staticDir, String(match[1]).replace(/^\//, ''));
}

function makeRuntimeHarness(html) {
    const dom = new JSDOM(stripDoctype(html), {
        url: 'http://localhost/'
    });
    const payload = extractSsrPayload(html);
    const clientFetchCalls = [];
    const sandbox = {
        console,
        window: dom.window,
        document: dom.window.document,
        self: dom.window,
        location: dom.window.location,
        history: dom.window.history,
        navigator: dom.window.navigator,
        Document: dom.window.Document,
        DOMParser: dom.window.DOMParser,
        Node: dom.window.Node,
        Text: dom.window.Text,
        Element: dom.window.Element,
        HTMLElement: dom.window.HTMLElement,
        HTMLInputElement: dom.window.HTMLInputElement,
        HTMLFormElement: dom.window.HTMLFormElement,
        Event: dom.window.Event,
        KeyboardEvent: dom.window.KeyboardEvent,
        MouseEvent: dom.window.MouseEvent,
        URL: dom.window.URL,
        URLSearchParams: dom.window.URLSearchParams,
        setTimeout: dom.window.setTimeout.bind(dom.window),
        clearTimeout: dom.window.clearTimeout.bind(dom.window),
        setInterval: dom.window.setInterval.bind(dom.window),
        clearInterval: dom.window.clearInterval.bind(dom.window),
        requestAnimationFrame: dom.window.requestAnimationFrame
            ? dom.window.requestAnimationFrame.bind(dom.window)
            : (callback) => dom.window.setTimeout(callback, 0),
        cancelAnimationFrame: dom.window.cancelAnimationFrame
            ? dom.window.cancelAnimationFrame.bind(dom.window)
            : (handle) => dom.window.clearTimeout(handle),
        fetch: (...args) => {
            clientFetchCalls.push(args);
            return Promise.reject(new Error('client fetch is disabled in scoped closeout hydration test'));
        },
        __zenith_ssr_data: payload
    };
    sandbox.globalThis = sandbox;
    sandbox.window.globalThis = sandbox;
    sandbox.window.__zenith_ssr_data = payload;
    sandbox.window.fetch = sandbox.fetch;
    return {
        clientFetchCalls,
        context: createContext(sandbox),
        root: dom.window.document
    };
}

async function evaluateBuiltPage(assetPath, context, staticDir) {
    const moduleCache = new Map();
    async function loadModule(modulePath) {
        const resolvedPath = resolve(modulePath);
        if (moduleCache.has(resolvedPath)) {
            return moduleCache.get(resolvedPath);
        }
        const source = await readFile(resolvedPath, 'utf8');
        const module = new SourceTextModule(source, {
            context,
            identifier: resolvedPath,
            initializeImportMeta(meta) {
                meta.url = pathToFileURL(resolvedPath).href;
            }
        });
        moduleCache.set(resolvedPath, module);
        await module.link(async (specifier, referencingModule) => {
            if (specifier.startsWith('/')) {
                return loadModule(join(staticDir, specifier.replace(/^\//, '')));
            }
            if (!specifier.startsWith('.')) {
                throw new Error(`Unexpected non-relative specifier ${specifier} from ${referencingModule.identifier}`);
            }
            return loadModule(resolve(dirname(referencingModule.identifier), specifier));
        });
        await module.evaluate();
        return module;
    }
    return loadModule(assetPath);
}

function textOf(root, selector) {
    const node = root.querySelector(selector);
    expect(node).toBeTruthy();
    return String(node.textContent || '');
}

describe('scoped server data closeout integration (#104)', () => {
    let project = null;
    let targets = [];

    afterEach(async () => {
        for (const target of targets) {
            target.server.close();
        }
        targets = [];
        if (project) {
            await rm(project.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            project = null;
        }
    });

    test('happy-path fixture flows from build to SSR payload to hydration without client re-execution', async () => {
        project = await createFixtureProject('happy-path-full-stack');
        targets = await startTargets(project);

        let nodeHtml = '';
        for (const target of targets) {
            const response = await fetchText(target.origin, '/');
            expect(response.status).toBe(200);
            expect(response.body).toContain('CSV_CLOSEOUT_NAV');
            expect(response.body).toContain('CSV_CLOSEOUT_SINGLE');
            expect(response.body).toContain('First');
            expect(response.body).toContain('Second');

            const payload = extractSsrPayload(response.body);
            expect(payload.viewer).toBe('Ada');
            expect(payload.route).toEqual({ viewer: 'Ada', routeOnly: true });
            expect(payload.scoped).toEqual({
                'layout:src/layouts/DefaultLayout.zen': {
                    navigation: { title: 'CSV_CLOSEOUT_NAV', secretLength: 33 }
                },
                'component:src/components/StatusBadge.zen': {
                    stats: { label: 'CSV_CLOSEOUT_SINGLE', count: 1 }
                },
                'component:src/components/Card.zen:o0': {
                    title: 'First',
                    count: 1,
                    featured: true
                },
                'component:src/components/Card.zen:o1': {
                    title: 'Second',
                    count: 2,
                    featured: false
                }
            });

            const resource = await fetchText(target.origin, '/api/ping');
            expect(resource.status).toBe(200);
            expect(JSON.parse(resource.body)).toEqual({ ok: true, kind: 'resource' });
            expect(resource.body).not.toContain('window.__zenith_ssr_data');
            expect(resource.body).not.toContain('CSV_CLOSEOUT_LAYOUT_SERVER_SOURCE');

            const missing = await fetchText(target.origin, '/missing');
            expect(missing.status).toBe(404);
            expect(missing.body).not.toContain('CSV_CLOSEOUT_LAYOUT_SERVER_SOURCE');
            expect(missing.body).not.toContain('CSV_CLOSEOUT_NAV');

            if (target.name === 'node') {
                nodeHtml = response.body;
            }
        }

        const staticDir = join(project.outDir, 'static');
        const assetPath = await extractPageAssetPath(nodeHtml, staticDir);
        const pageJs = await readFile(assetPath, 'utf8');
        expect(pageJs).toContain('layout:src/layouts/DefaultLayout.zen');
        expect(pageJs).toContain('component:src/components/Card.zen:o0');
        expect(pageJs).not.toContain('CSV_CLOSEOUT_LAYOUT_SERVER_SOURCE');
        expect(pageJs).not.toContain('export const data = async');

        const { clientFetchCalls, context, root } = makeRuntimeHarness(nodeHtml);
        const pageModule = await evaluateBuiltPage(assetPath, context, staticDir);
        pageModule.namespace.__zenith_mount(root, {});

        expect(textOf(root, '[data-testid="layout"]')).toContain('CSV_CLOSEOUT_NAV');
        expect(textOf(root, '[data-testid="route"]')).toBe('Ada');
        expect(textOf(root, '[data-testid="singleton"]')).toBe('CSV_CLOSEOUT_SINGLE');
        expect([...root.querySelectorAll('.card')].map((node) => node.textContent)).toEqual([
            'First:1',
            'Second:2'
        ]);
        expect(clientFetchCalls).toEqual([]);

        const staticFiles = await readTextFiles(staticDir);
        for (const file of staticFiles) {
            expect(file.source).not.toContain('CSV_CLOSEOUT_LAYOUT_SERVER_SOURCE');
            expect(file.source).not.toContain('export const data = async');
        }
    });
});
