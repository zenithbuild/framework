/**
 * Headless Chrome benchmark for the render-utils extraction.
 *
 * Compares a baseline dist (train) with a candidate dist (this branch) in real
 * Chromium. Two graphs:
 * - unbundled: the built ESM modules, served over HTTP
 * - emitted: the production-emitted concatenated runtime template
 *
 * Usage (from packages/runtime):
 *   RENDER_BROWSER_BASELINE=/path/to/train/packages/runtime/dist \
 *   RENDER_BROWSER_CANDIDATE=/path/to/branch/packages/runtime/dist \
 *   bun ./scripts/render-utils-browser-bench.js
 *
 * Requires Playwright (this repo ships it on apps/smoke-test) and Google Chrome
 * on PATH (`channel: chrome`). Set RENDER_BROWSER_PLAYWRIGHT to a playwright
 * index.mjs if it is not in the usual workspace location.
 *
 * Env:
 *   RENDER_BROWSER_BASELINE     dist directory for the before build
 *   RENDER_BROWSER_CANDIDATE    dist directory for the after build
 *   RENDER_BROWSER_OUT          optional JSON output path
 *   RENDER_BENCH_SAMPLES        odd sample count inside each page (default 21)
 *   RENDER_BROWSER_RUNS         page loads per graph (default 5)
 *   RENDER_BROWSER_CHANNEL      Playwright channel (default chrome)
 *   RENDER_BROWSER_EXECUTABLE   optional Chrome executablePath
 *   RENDER_BROWSER_PLAYWRIGHT   optional path to playwright's index.mjs
 */
import { cpus, hostname, platform, arch, release } from 'node:os';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SAMPLES = normalizeSampleCount(Number(process.env.RENDER_BENCH_SAMPLES || 21));
const RUNS = normalizeRunCount(Number(process.env.RENDER_BROWSER_RUNS || 5));
const ITERS = {
    textMarker: 50000,
    attrMarker: 50000,
    fragmentTextUpdate: 30000,
    fragmentHtmlUpdate: 2500,
    commentHtmlMarker: 5000,
    coerceTextDirect: 600000,
    contextualFragmentDirect: 8000
};

function normalizeSampleCount(value) {
    if (!Number.isInteger(value) || value < 5) return 21;
    return value % 2 === 0 ? value + 1 : value;
}

function normalizeRunCount(value) {
    if (!Number.isInteger(value) || value < 1) return 5;
    return value;
}

function playwrightCandidates() {
    const listed = [
        process.env.RENDER_BROWSER_PLAYWRIGHT,
        join(SCRIPT_DIR, '../../../apps/smoke-test/node_modules/playwright/index.mjs'),
        join(SCRIPT_DIR, '../../../node_modules/playwright/index.mjs')
    ];
    return listed.filter((entry) => typeof entry === 'string' && entry.length > 0 && existsSync(entry));
}

async function loadPlaywright() {
    const candidates = playwrightCandidates();
    if (candidates.length === 0) {
        throw new Error(
            'Playwright was not found. Install it (apps/smoke-test depends on playwright) or set RENDER_BROWSER_PLAYWRIGHT to index.mjs. No browser numbers were recorded.'
        );
    }
    return import(pathToFileURL(candidates[0]).href);
}

function pageHtml(moduleScript) {
    return `<!doctype html>
<html><head><meta charset="utf-8"></head><body>
<script type="module">
try {
${moduleScript}
  globalThis.__ready = true;
} catch (error) {
  globalThis.__bootError = error && error.stack ? String(error.stack) : String(error);
  globalThis.__ready = 'error';
}
</script>
</body></html>`;
}

const UNBUNDLED_HTML = pageHtml(`  const render = await import('./render.js');
  const patch = await import('./fragment-patch.js');
  globalThis.__api = {
    applyMarker: render._applyMarkerValue,
    coerceText: render._coerceText,
    createFragment: render._createContextualFragment,
    createRegion: patch.createFragmentRegion,
    sameCoerceIdentity: render._coerceText === patch.coerceText
  };`);

const EMITTED_HTML = pageHtml(`  const emitted = await import('./emitted.mjs');
  globalThis.__api = {
    applyMarker: emitted._applyMarkerValue,
    coerceText: emitted._coerceText,
    createFragment: emitted._createContextualFragment,
    createRegion: emitted.createFragmentRegion,
    sameCoerceIdentity: emitted._coerceText === emitted.coerceText
  };`);

function contentType(filePath) {
    const extension = extname(filePath);
    if (extension === '.html') return 'text/html; charset=utf-8';
    if (extension === '.js' || extension === '.mjs') return 'text/javascript; charset=utf-8';
    return 'application/octet-stream';
}

function serveDist(distDir, emittedSource) {
    const root = resolve(distDir);
    return Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch(req) {
            const url = new URL(req.url);
            if (url.pathname === '/bench.html' || url.pathname === '/') {
                return new Response(UNBUNDLED_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
            }
            if (url.pathname === '/emitted.html') {
                return new Response(EMITTED_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
            }
            if (url.pathname === '/emitted.mjs') {
                return new Response(emittedSource, { headers: { 'content-type': 'text/javascript; charset=utf-8' } });
            }
            const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
            if (relative.includes('..') || relative.includes('\\')) {
                return new Response('bad path', { status: 400 });
            }
            const filePath = join(root, relative);
            const file = Bun.file(filePath);
            if (!file.size) {
                return new Response('missing', { status: 404 });
            }
            return new Response(file, { headers: { 'content-type': contentType(filePath) } });
        }
    });
}

async function readEmittedSource(distDir) {
    const template = await import(pathToFileURL(join(resolve(distDir), 'template.js')).href);
    return template.runtimeModuleProfileSnapshot('production-emitted').source;
}

function benchInPage(config) {
    const api = globalThis.__api;
    const brand = Symbol.for('zenith.html_fragment');
    function htmlFragment(html) {
        return { __zenith_fragment: true, html, [brand]: true };
    }
    function summarize(samples) {
        const sorted = samples.slice().sort((left, right) => left - right);
        const mid = Math.floor(sorted.length / 2);
        let total = 0;
        for (let i = 0; i < sorted.length; i++) total += sorted[i];
        const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
        return {
            samples: sorted.length,
            medianNs: sorted[mid],
            minNs: sorted[0],
            p95Ns: sorted[p95Index],
            meanNs: Math.round(total / sorted.length)
        };
    }
    function measure(work) {
        for (let i = 0; i < 3; i++) work();
        const samples = new Array(config.samples);
        for (let i = 0; i < config.samples; i++) {
            const start = performance.now();
            work();
            samples[i] = Math.round((performance.now() - start) * 1e6);
        }
        return summarize(samples);
    }
    const textHost = document.createElement('div');
    api.applyMarker([textHost], { kind: 'text', index: 0 }, 'fingerprint');
    const attrHost = document.createElement('button');
    api.applyMarker([attrHost], { kind: 'attr', index: 1, attr: 'title' }, 'named');
    api.applyMarker([attrHost], { kind: 'attr', index: 2, attr: 'disabled' }, true);
    const listHost = document.createElement('div');
    document.body.appendChild(listHost);
    const region = api.createRegion();
    region.mount(['a', 'b'], { parent: listHost, insertBefore: null, rootPath: 'fingerprint' });
    region.update(['a', htmlFragment('<em>c</em>')], { parent: listHost, insertBefore: null, rootPath: 'fingerprint' });
    const commentHost = document.createElement('div');
    document.body.appendChild(commentHost);
    const anchor = document.createComment('zx:bind:0');
    commentHost.appendChild(anchor);
    api.applyMarker([anchor], { kind: 'text', index: 3 }, htmlFragment('<strong>z</strong>'));
    const fingerprint = [
        textHost.textContent,
        attrHost.getAttribute('title'),
        String(attrHost.hasAttribute('disabled')),
        listHost.innerHTML,
        commentHost.innerHTML,
        [api.coerceText(null, 'fingerprint'), api.coerceText(false, 'fingerprint'), api.coerceText(0, 'fingerprint'), api.coerceText('ok', 'fingerprint')].join('|')
    ].join('::');
    region.destroy();
    listHost.remove();
    commentHost.remove();

    const workText = document.createElement('span');
    const workAttr = document.createElement('span');
    const textMarker = { kind: 'text', index: 0 };
    const attrMarker = { kind: 'attr', index: 1, attr: 'title' };
    const fragHost = document.createElement('div');
    document.body.appendChild(fragHost);
    const frag = api.createRegion();
    const listA = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const listB = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'changed'];
    const listCtx = { parent: fragHost, insertBefore: null, rootPath: 'bench' };
    frag.mount(listA, listCtx);
    const htmlHost = document.createElement('div');
    document.body.appendChild(htmlHost);
    const htmlRegion = api.createRegion();
    const htmlA = [htmlFragment('<span>a</span>'), htmlFragment('<span>b</span>')];
    const htmlB = [htmlFragment('<span>a</span>'), htmlFragment('<i>c</i>')];
    const htmlCtx = { parent: htmlHost, insertBefore: null, rootPath: 'bench-html' };
    htmlRegion.mount(htmlA, htmlCtx);
    const commentWork = document.createElement('div');
    document.body.appendChild(commentWork);
    const commentAnchor = document.createComment('zx:bind:0');
    commentWork.appendChild(commentAnchor);
    const commentMarker = { kind: 'text', index: 4 };
    const commentA = htmlFragment('<span>a</span>');
    const commentB = htmlFragment('<span>b</span>');
    const contextParent = document.createElement('div');
    document.body.appendChild(contextParent);
    const iters = config.iters;
    const cases = {
        textMarker: measure(() => {
            for (let i = 0; i < iters.textMarker; i++) api.applyMarker([workText], textMarker, i % 2 === 0 ? 'alpha' : 'beta');
        }),
        attrMarker: measure(() => {
            for (let i = 0; i < iters.attrMarker; i++) api.applyMarker([workAttr], attrMarker, i % 2 === 0 ? 'alpha' : 'beta');
        }),
        fragmentTextUpdate: measure(() => {
            for (let i = 0; i < iters.fragmentTextUpdate; i++) frag.update(i % 2 === 0 ? listB : listA, listCtx);
        }),
        fragmentHtmlUpdate: measure(() => {
            for (let i = 0; i < iters.fragmentHtmlUpdate; i++) htmlRegion.update(i % 2 === 0 ? htmlB : htmlA, htmlCtx);
        }),
        commentHtmlMarker: measure(() => {
            for (let i = 0; i < iters.commentHtmlMarker; i++) api.applyMarker([commentAnchor], commentMarker, i % 2 === 0 ? commentB : commentA);
        }),
        coerceTextDirect: measure(() => {
            let size = 0;
            for (let i = 0; i < iters.coerceTextDirect; i++) size += api.coerceText(i, 'bench').length;
            return size;
        }),
        contextualFragmentDirect: measure(() => {
            let count = 0;
            for (let i = 0; i < iters.contextualFragmentDirect; i++) count += api.createFragment(contextParent, '<span>x</span>').childNodes.length;
            return count;
        })
    };
    frag.destroy();
    htmlRegion.destroy();
    fragHost.remove();
    htmlHost.remove();
    commentWork.remove();
    contextParent.remove();
    return {
        fingerprint,
        sameCoerceIdentity: api.sameCoerceIdentity === true,
        cases
    };
}

async function loadPage(browser, origin, pathname) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => {
        errors.push(error && error.stack ? String(error.stack) : String(error));
    });
    try {
        await page.goto(`${origin}${pathname}`, { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction(() => globalThis.__ready === true || globalThis.__ready === 'error', null, { timeout: 30000 });
        const bootError = await page.evaluate(() => globalThis.__bootError || '');
        if (bootError) {
            throw new Error(bootError);
        }
        return { page, errors };
    } catch (error) {
        await page.close();
        const detail = errors.length > 0 ? `\n${errors.join('\n')}` : '';
        throw new Error(`${pathname} failed to boot: ${error && error.message ? error.message : error}${detail}`);
    }
}

async function measureGraph(browser, origin, graph) {
    const pathname = graph === 'unbundled-esm' ? '/bench.html' : '/emitted.html';
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
        const loaded = await loadPage(browser, origin, pathname);
        try {
            runs.push(await loaded.page.evaluate(benchInPage, { samples: SAMPLES, iters: ITERS }));
        } finally {
            await loaded.page.close();
        }
    }
    const fingerprint = runs[0].fingerprint;
    const sameCoerceIdentity = runs.every((run) => run.sameCoerceIdentity === true && run.fingerprint === fingerprint);
    const cases = {};
    const caseNames = Object.keys(runs[0].cases);
    for (let i = 0; i < caseNames.length; i++) {
        const name = caseNames[i];
        cases[name] = {
            runMedianNs: runs.map((run) => run.cases[name].medianNs)
        };
    }
    return { graph, fingerprint, sameCoerceIdentity, runs, cases };
}

async function measureDist(browser, distDir, label) {
    const emitted = await readEmittedSource(distDir);
    const server = serveDist(distDir, emitted);
    try {
        const origin = `http://127.0.0.1:${server.port}`;
        const graphs = [];
        graphs.push(await measureGraph(browser, origin, 'unbundled-esm'));
        graphs.push(await measureGraph(browser, origin, 'emitted-production-template'));
        return { label, distDir: resolve(distDir), graphs };
    } finally {
        server.stop(true);
    }
}

function environment(browserVersion) {
    const cpu = cpus()[0] || { model: 'unknown', speed: 0 };
    return {
        hostname: hostname(),
        platform: platform(),
        arch: arch(),
        release: release(),
        cpuModel: cpu.model,
        cpuSpeedMHz: cpu.speed,
        cpuCount: cpus().length,
        bun: Bun.version,
        browser: browserVersion,
        channel: process.env.RENDER_BROWSER_CHANNEL || 'chrome',
        samplesPerPage: SAMPLES,
        pageLoadsPerGraph: RUNS,
        warmupIterationsDiscardedPerMeasure: 3,
        timer: 'performance.now() converted to nanoseconds',
        iterationsPerSample: ITERS
    };
}

const baselineDir = process.env.RENDER_BROWSER_BASELINE || '';
const candidateDir = process.env.RENDER_BROWSER_CANDIDATE || '';
if (!baselineDir || !candidateDir) {
    process.stderr.write('Set RENDER_BROWSER_BASELINE and RENDER_BROWSER_CANDIDATE to runtime dist directories.\n');
    process.exit(2);
}

const playwright = await loadPlaywright();
const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
};
if (process.env.RENDER_BROWSER_EXECUTABLE) {
    launchOptions.executablePath = process.env.RENDER_BROWSER_EXECUTABLE;
} else {
    launchOptions.channel = process.env.RENDER_BROWSER_CHANNEL || 'chrome';
}
const browser = await playwright.chromium.launch(launchOptions);
try {
    const browserVersion = browser.version();
    const result = {
        environment: environment(browserVersion),
        variants: [
            await measureDist(browser, baselineDir, 'train-baseline'),
            await measureDist(browser, candidateDir, 'render-utils')
        ]
    };
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (process.env.RENDER_BROWSER_OUT) writeFileSync(process.env.RENDER_BROWSER_OUT, json);
    process.stdout.write(json);
} finally {
    await browser.close();
}
