import { jest } from '@jest/globals';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { SourceTextModule, createContext } from 'node:vm';
import { pathToFileURL } from 'node:url';
import { build } from '../dist/build.js';

const require = createRequire(import.meta.url);
const JEST_JSDOM_DIR = dirname(require.resolve('jest-environment-jsdom/package.json'));
const { JSDOM } = require(require.resolve('jsdom', { paths: [JEST_JSDOM_DIR] }));

jest.setTimeout(60000);

async function createProject(files) {
    const root = join(tmpdir(), `zenith-scoped-template-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return {
        root,
        pagesDir: join(root, 'src', 'pages'),
        outDir: join(root, 'dist')
    };
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

async function readBuiltPage(staticDir) {
    const indexHtml = await readFile(join(staticDir, 'index.html'), 'utf8');
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
    if (!assetSrc) {
        const scripts = [...indexHtml.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
        const pageScript = scripts.find((script) => /\bdata-zx-page\b/.test(script)) || scripts[0] || '';
        const match = pageScript.match(/src="([^"]+\.js)"/);
        assetSrc = match ? match[1] : '';
    }
    const match = assetSrc ? [assetSrc, assetSrc] : null;
    expect(match).toBeTruthy();
    const assetPath = join(staticDir, String(match[1]).replace(/^\//, ''));
    const pageJs = await readFile(assetPath, 'utf8');
    return { indexHtml, assetPath, pageJs };
}

function stripDoctype(html) {
    return html.replace(/^<!doctype[^>]*>/i, '');
}

function makeRuntimeHarness(indexHtml, payload) {
    const dom = new JSDOM(stripDoctype(indexHtml), {
        url: 'http://localhost/'
    });
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
        __zenith_ssr_data: payload
    };
    sandbox.globalThis = sandbox;
    sandbox.window.globalThis = sandbox;
    sandbox.window.__zenith_ssr_data = payload;
    return {
        dom,
        root: dom.window.document,
        context: createContext(sandbox)
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

describe('scoped server template binding (#100A)', () => {
    let project = null;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            project = null;
        }
    });

    test('compiled template runtime renders layout, singleton, and repeated scoped slices', async () => {
        project = await createProject({
            'src/layouts/DefaultLayout.zen': [
                '<script server lang="ts">',
                'const navigation = { title: "CSV_TEMPLATE_LAYOUT_SOURCE" }',
                '</script>',
                '<nav data-testid="layout">{navigation.title}<slot /></nav>'
            ].join('\n'),
            'src/components/StatusCard.zen': [
                '<script server lang="ts">',
                'const stats = { label: "CSV_TEMPLATE_SINGLE_SOURCE" }',
                '</script>',
                '<p data-testid="single">{stats.label}</p>'
            ].join('\n'),
            'src/components/Card.zen': [
                '<script server lang="ts">',
                'export const data = async (ctx, props) => ({ label: props.label })',
                '</script>',
                '<article class="card">{data.label}</article>'
            ].join('\n'),
            'src/pages/index.zen': [
                '<script lang="ts">',
                'import DefaultLayout from "../layouts/DefaultLayout.zen";',
                'import StatusCard from "../components/StatusCard.zen";',
                'import Card from "../components/Card.zen";',
                '</script>',
                '<DefaultLayout>',
                '<p data-testid="route">{data.viewer}</p>',
                '<StatusCard />',
                '<Card label="first" />',
                '<Card label="second" />',
                '</DefaultLayout>'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node", router: true };\n'
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            projectRoot: project.root,
            config: { target: 'node', router: true }
        });
        const staticDir = join(project.outDir, 'static');
        const { indexHtml, assetPath, pageJs } = await readBuiltPage(staticDir);
        const payload = {
            viewer: 'Ada',
            route: { viewer: 'Ada' },
            scoped: {
                'layout:src/layouts/DefaultLayout.zen': {
                    navigation: { title: 'Layout From Scoped Payload' }
                },
                'component:src/components/StatusCard.zen': {
                    stats: { label: 'Singleton From Scoped Payload' }
                },
                'component:src/components/Card.zen:o0': {
                    label: 'First From Scoped Payload'
                },
                'component:src/components/Card.zen:o1': {
                    label: 'Second From Scoped Payload'
                }
            }
        };
        const { root, context } = makeRuntimeHarness(indexHtml, payload);

        const pageModule = await evaluateBuiltPage(assetPath, context, staticDir);
        pageModule.namespace.__zenith_mount(root, {});

        expect(textOf(root, '[data-testid="layout"]')).toContain('Layout From Scoped Payload');
        expect(textOf(root, '[data-testid="route"]')).toBe('Ada');
        expect(textOf(root, '[data-testid="single"]')).toBe('Singleton From Scoped Payload');
        expect([...root.querySelectorAll('.card')].map((node) => node.textContent)).toEqual([
            'First From Scoped Payload',
            'Second From Scoped Payload'
        ]);
        expect(pageJs).toContain('component:src/components/Card.zen:o0');
        expect(pageJs).toContain('component:src/components/Card.zen:o1');

        const staticFiles = await readTextFiles(staticDir);
        for (const file of staticFiles) {
            expect(file.source).not.toContain('CSV_TEMPLATE_LAYOUT_SOURCE');
            expect(file.source).not.toContain('CSV_TEMPLATE_SINGLE_SOURCE');
            expect(file.source).not.toContain('export const data = async');
        }
    });

    test('page route data reads route payload with legacy flat fallback', async () => {
        project = await createProject({
            'src/pages/index.zen': '<main data-testid="route">{data.viewer}</main>',
            'zenith.config.js': 'module.exports = { target: "node", router: true };\n'
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            projectRoot: project.root,
            config: { target: 'node', router: true }
        });
        const { indexHtml, assetPath } = await readBuiltPage(join(project.outDir, 'static'));

        const legacy = makeRuntimeHarness(indexHtml, { viewer: 'Legacy Ada' });
        const staticDir = join(project.outDir, 'static');
        const legacyModule = await evaluateBuiltPage(assetPath, legacy.context, staticDir);
        legacyModule.namespace.__zenith_mount(legacy.root, {});
        expect(textOf(legacy.root, '[data-testid="route"]')).toBe('Legacy Ada');

        const legacyWithRouteKey = makeRuntimeHarness(indexHtml, {
            viewer: 'Ada',
            route: { path: '/profile' }
        });
        const legacyWithRouteKeyModule = await evaluateBuiltPage(assetPath, legacyWithRouteKey.context, staticDir);
        legacyWithRouteKeyModule.namespace.__zenith_mount(legacyWithRouteKey.root, {});
        expect(textOf(legacyWithRouteKey.root, '[data-testid="route"]')).toBe('Ada');

        const namespaced = makeRuntimeHarness(indexHtml, {
            viewer: 'Flat Ada',
            route: { viewer: 'Route Ada' },
            scoped: {
                'component:src/components/Unused.zen': { viewer: 'Scoped Ada' }
            }
        });
        const namespacedModule = await evaluateBuiltPage(assetPath, namespaced.context, staticDir);
        namespacedModule.namespace.__zenith_mount(namespaced.root, {});
        expect(textOf(namespaced.root, '[data-testid="route"]')).toBe('Route Ada');
    });
});
