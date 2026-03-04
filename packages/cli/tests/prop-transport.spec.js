import { build } from '../dist/build.js';
import { jest } from '@jest/globals';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { SourceTextModule, createContext } from 'node:vm';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures');
const require = createRequire(import.meta.url);
const JEST_JSDOM_DIR = dirname(require.resolve('jest-environment-jsdom/package.json'));
const { JSDOM } = require(require.resolve('jsdom', { paths: [JEST_JSDOM_DIR] }));

jest.setTimeout(20000);

async function createFixtureProject(fixtureName) {
    const root = await mkdtemp(join(tmpdir(), `zenith-${fixtureName}-`));
    await cp(join(FIXTURES_DIR, fixtureName), root, { recursive: true });
    return {
        root,
        pagesDir: join(root, 'src', 'pages'),
        outDir: join(root, 'dist')
    };
}

function stripDoctype(html) {
    return html.replace(/^<!doctype[^>]*>/i, '');
}

function extractPageAssetPath(html, outDir) {
    const match = html.match(/src="([^"]+\.js)"/);
    expect(match).toBeTruthy();
    return join(outDir, String(match[1]).replace(/^\//, ''));
}

function extractSsrPayload(html) {
    const match = html.match(/window\.__zenith_ssr_data\s*=\s*(\{[\s\S]*?\});/);
    return match ? JSON.parse(match[1]) : {};
}

async function readBuiltPage(outDir) {
    const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8');
    const assetPath = extractPageAssetPath(indexHtml, outDir);
    const pageJs = await readFile(assetPath, 'utf8');
    return { indexHtml, assetPath, pageJs };
}

function makeRuntimeHarness(indexHtml) {
    const dom = new JSDOM(stripDoctype(indexHtml), {
        url: 'http://localhost/'
    });
    const payload = extractSsrPayload(indexHtml);
    const sandbox = {
        console,
        window: dom.window,
        document: dom.window.document,
        self: dom.window,
        location: dom.window.location,
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

function testNode(root, id) {
    const node = root.querySelector(`[data-testid="${id}"]`);
    expect(node).toBeTruthy();
    return node;
}

function textOf(root, id) {
    return String(testNode(root, id).textContent || '');
}

async function evaluateBuiltPage(assetPath, context) {
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
            if (!specifier.startsWith('.')) {
                throw new Error(`Unexpected non-relative specifier ${specifier} from ${referencingModule.identifier}`);
            }
            return loadModule(resolve(dirname(referencingModule.identifier), specifier));
        });
        return module;
    }

    const entry = await loadModule(assetPath);
    await entry.evaluate();
    return entry;
}

describe('function prop transport', () => {
    let project = null;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('emitted props use scoped symbols for direct and forwarded event-like props', async () => {
        project = await createFixtureProject('prop-transport');
        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const { pageJs } = await readBuiltPage(project.outDir);

        expect(pageJs).not.toContain('onClick: increment');
        expect(pageJs).not.toContain('onKeydown: handlers.onKeydown');
        expect(pageJs).not.toContain('onSubmit: (event) => handlers.onSubmit(event)');
        expect(pageJs).not.toContain('currentCount: count');
        expect(pageJs).not.toContain('nextCount: count + 1');

        expect(pageJs).not.toContain('onClick: incoming.onClick');
        expect(pageJs).not.toContain('onKeydown: incoming.onKeydown');
        expect(pageJs).not.toContain('onInput: incoming.onInput');
        expect(pageJs).not.toContain('onSubmit: incoming.onSubmit');
        expect(pageJs).not.toContain('currentCount: incoming.currentCount');
        expect(pageJs).not.toContain('nextCount: incoming.nextCount');

        expect(pageJs).toMatch(/onClick:\s*___.*increment/);
        expect(pageJs).toMatch(/onKeydown:\s*___.*handlers\.onKeydown/);
        expect(pageJs).toMatch(/onInput:\s*___.*handlers\.onInput/);
        expect(pageJs).toMatch(/onSubmit:\s*(?:function\s*\(event\)\s*\{\s*return\s+___.*handlers\.onSubmit\(event\);\s*\}|\(?event\)?\s*=>\s*___.*handlers\.onSubmit\(event\))/);
        expect(pageJs).toMatch(/currentCount:\s*___.*count/);
        expect(pageJs).toMatch(/nextCount:\s*___.*count\.get\(\)\s*\+\s*1/);

        expect(pageJs).toMatch(/onClick:\s*___.*incoming\.onClick/);
        expect(pageJs).toMatch(/onKeydown:\s*___.*incoming\.onKeydown/);
        expect(pageJs).toMatch(/onInput:\s*___.*incoming\.onInput/);
        expect(pageJs).toMatch(/onSubmit:\s*___.*incoming\.onSubmit/);
        expect(pageJs).toMatch(/currentCount:\s*___.*incoming\.currentCount/);
        expect(pageJs).toMatch(/nextCount:\s*___.*incoming\.nextCount/);
    });

    test('real hydration transports function props across direct and forwarded component hops', async () => {
        project = await createFixtureProject('prop-transport');
        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const { indexHtml, assetPath } = await readBuiltPage(project.outDir);
        const { dom, root, context } = makeRuntimeHarness(indexHtml);

        await evaluateBuiltPage(assetPath, context);

        expect(textOf(root, 'click-count')).toBe('0');
        expect(textOf(root, 'direct-current')).toBe('0');
        expect(textOf(root, 'forwarded-current')).toBe('0');
        expect(textOf(root, 'direct-next')).toBe('1');
        expect(textOf(root, 'forwarded-next')).toBe('1');

        testNode(root, 'direct-btn').click();
        expect(textOf(root, 'click-count')).toBe('1');

        testNode(root, 'forwarded-btn').click();
        expect(textOf(root, 'click-count')).toBe('2');

        testNode(root, 'direct-btn').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(textOf(root, 'last-keydown')).toBe('direct:Enter');

        testNode(root, 'forwarded-btn').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
        expect(textOf(root, 'last-keydown')).toBe('forwarded:Space');

        const directInput = /** @type {HTMLInputElement} */ (testNode(root, 'direct-inp'));
        directInput.value = 'alpha';
        directInput.dispatchEvent(new dom.window.Event('input', { bubbles: true, cancelable: true }));
        expect(textOf(root, 'last-input')).toBe('direct:alpha');

        const forwardedInput = /** @type {HTMLInputElement} */ (testNode(root, 'forwarded-inp'));
        forwardedInput.value = 'beta';
        forwardedInput.dispatchEvent(new dom.window.Event('input', { bubbles: true, cancelable: true }));
        expect(textOf(root, 'last-input')).toBe('forwarded:beta');

        const directSubmit = testNode(root, 'direct-form');
        directSubmit.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        expect(textOf(root, 'last-submit')).toBe('direct:1');

        const forwardedSubmit = testNode(root, 'forwarded-form');
        forwardedSubmit.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        expect(textOf(root, 'last-submit')).toBe('forwarded:2');

        dom.window.close();
    });
});
