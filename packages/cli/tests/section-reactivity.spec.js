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
        Event: dom.window.Event,
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
        __zenith_ssr_data: {}
    };
    sandbox.globalThis = sandbox;
    sandbox.window.globalThis = sandbox;
    sandbox.window.__zenith_ssr_data = {};
    return {
        dom,
        root: dom.window.document,
        context: createContext(sandbox)
    };
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

function testNode(root, id) {
    const node = root.querySelector(`[data-testid="${id}"]`);
    expect(node).toBeTruthy();
    return node;
}

function textOf(root, id) {
    return String(testNode(root, id).textContent || '');
}

describe('section reactivity and mount wiring', () => {
    let project = null;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('keeps signal reactivity, click handlers, and ref readiness with multi-section composition', async () => {
        project = await createFixtureProject('section-reactivity');
        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const { indexHtml, assetPath, pageJs } = await readBuiltPage(project.outDir);

        expect(pageJs).not.toContain('props as');

        const { dom, root, context } = makeRuntimeHarness(indexHtml);
        await evaluateBuiltPage(assetPath, context);

        expect(root.querySelectorAll('[data-testid="section-shell"]').length).toBe(3);
        expect(textOf(root, 'mount-status')).toBe('ready');
        expect(textOf(root, 'counter-text')).toBe('0');

        testNode(root, 'counter-btn').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        expect(textOf(root, 'counter-text')).toBe('1');

        testNode(root, 'counter-btn').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        expect(textOf(root, 'counter-text')).toBe('2');

        dom.window.close();
    });
});
