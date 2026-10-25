/**
 * Synthetic render-helper benchmark for the render-utils extraction.
 *
 * Measures two graphs:
 * - unbundled: separate ESM modules (dev/test import graph)
 * - emitted: production-shaped concatenated runtime template (imports stripped)
 *
 * The emitted graph is what the bundler ships. Cross-module live bindings exist
 * only on the unbundled graph.
 *
 * Usage (from packages/runtime):
 *   bun --preload ./bun-test-setup.js ./scripts/render-utils-bench.js
 *
 * Env:
 *   RENDER_BENCH_SAMPLES  odd sample count (default 21)
 *   RENDER_BENCH_LABEL    label stored in the JSON result
 */
import { cpus, tmpdir, hostname, platform, arch, release } from 'node:os';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SAMPLES = normalizeSampleCount(Number(process.env.RENDER_BENCH_SAMPLES || 21));
const LABEL = process.env.RENDER_BENCH_LABEL || 'unlabeled';
const HTML_FRAGMENT_BRAND = Symbol.for('zenith.html_fragment');

const TEXT_ITERS = 50000;
const ATTR_ITERS = 50000;
const FRAGMENT_UPDATES = 30000;
const HTML_FRAGMENT_UPDATES = 2500;
const COMMENT_HTML_UPDATES = 5000;
const COERCE_ITERS = 600000;
const CONTEXT_ITERS = 8000;

function normalizeSampleCount(value) {
    if (!Number.isInteger(value) || value < 5) return 21;
    return value % 2 === 0 ? value + 1 : value;
}

function htmlFragment(html) {
    return {
        __zenith_fragment: true,
        html,
        [HTML_FRAGMENT_BRAND]: true
    };
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
    const samples = new Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
        const start = Bun.nanoseconds();
        work();
        samples[i] = Bun.nanoseconds() - start;
    }
    return summarize(samples);
}

function fingerprintFor(api) {
    const textHost = document.createElement('div');
    api.applyMarker([textHost], { kind: 'text', index: 0 }, 'fingerprint');

    const attrHost = document.createElement('button');
    api.applyMarker([attrHost], { kind: 'attr', index: 1, attr: 'title' }, 'named');
    api.applyMarker([attrHost], { kind: 'attr', index: 2, attr: 'disabled' }, true);

    const listHost = document.createElement('div');
    document.body.appendChild(listHost);
    const region = api.createRegion();
    region.mount(['a', 'b'], { parent: listHost, insertBefore: null, rootPath: 'fingerprint' });
    region.update(['a', htmlFragment('<em>c</em>')], {
        parent: listHost,
        insertBefore: null,
        rootPath: 'fingerprint'
    });
    const listText = listHost.innerHTML;

    const commentHost = document.createElement('div');
    document.body.appendChild(commentHost);
    const anchor = document.createComment('zx:bind:0');
    commentHost.appendChild(anchor);
    api.applyMarker([anchor], { kind: 'text', index: 3 }, htmlFragment('<strong>z</strong>'));
    const commentHtml = commentHost.innerHTML;

    const coerced = [
        api.coerceText(null, 'fingerprint'),
        api.coerceText(false, 'fingerprint'),
        api.coerceText(0, 'fingerprint'),
        api.coerceText('ok', 'fingerprint')
    ].join('|');

    region.destroy();
    listHost.remove();
    commentHost.remove();

    return [
        textHost.textContent,
        attrHost.getAttribute('title'),
        String(attrHost.hasAttribute('disabled')),
        listText,
        commentHtml,
        coerced
    ].join('::');
}

function worksFor(api) {
    const textHost = document.createElement('span');
    const textMarker = { kind: 'text', index: 0 };
    const attrHost = document.createElement('span');
    const attrMarker = { kind: 'attr', index: 1, attr: 'title' };

    const listHost = document.createElement('div');
    document.body.appendChild(listHost);
    const region = api.createRegion();
    const listA = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const listB = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'changed'];
    const listCtx = { parent: listHost, insertBefore: null, rootPath: 'bench' };
    region.mount(listA, listCtx);

    const htmlHost = document.createElement('div');
    document.body.appendChild(htmlHost);
    const htmlRegion = api.createRegion();
    const htmlA = [htmlFragment('<span>a</span>'), htmlFragment('<span>b</span>')];
    const htmlB = [htmlFragment('<span>a</span>'), htmlFragment('<i>c</i>')];
    const htmlCtx = { parent: htmlHost, insertBefore: null, rootPath: 'bench-html' };
    htmlRegion.mount(htmlA, htmlCtx);

    const commentHost = document.createElement('div');
    document.body.appendChild(commentHost);
    const anchor = document.createComment('zx:bind:0');
    commentHost.appendChild(anchor);
    const commentMarker = { kind: 'text', index: 4 };
    const commentA = htmlFragment('<span>a</span>');
    const commentB = htmlFragment('<span>b</span>');

    const parent = document.createElement('div');
    document.body.appendChild(parent);

    return {
        textMarker() {
            for (let i = 0; i < TEXT_ITERS; i++) {
                api.applyMarker([textHost], textMarker, i % 2 === 0 ? 'alpha' : 'beta');
            }
        },
        attrMarker() {
            // Control path: attribute updates do not call the extracted helpers.
            for (let i = 0; i < ATTR_ITERS; i++) {
                api.applyMarker([attrHost], attrMarker, i % 2 === 0 ? 'alpha' : 'beta');
            }
        },
        fragmentTextUpdate() {
            for (let i = 0; i < FRAGMENT_UPDATES; i++) {
                region.update(i % 2 === 0 ? listB : listA, listCtx);
            }
        },
        fragmentHtmlUpdate() {
            for (let i = 0; i < HTML_FRAGMENT_UPDATES; i++) {
                htmlRegion.update(i % 2 === 0 ? htmlB : htmlA, htmlCtx);
            }
        },
        commentHtmlMarker() {
            for (let i = 0; i < COMMENT_HTML_UPDATES; i++) {
                api.applyMarker([anchor], commentMarker, i % 2 === 0 ? commentB : commentA);
            }
        },
        coerceTextDirect() {
            let size = 0;
            for (let i = 0; i < COERCE_ITERS; i++) {
                size += api.coerceText(i, 'bench').length;
            }
            return size;
        },
        contextualFragmentDirect() {
            let count = 0;
            for (let i = 0; i < CONTEXT_ITERS; i++) {
                count += api.createFragment(parent, '<span>x</span>').childNodes.length;
            }
            return count;
        },
        cleanup() {
            region.destroy();
            htmlRegion.destroy();
            listHost.remove();
            htmlHost.remove();
            commentHost.remove();
            parent.remove();
        }
    };
}

async function loadUnbundled() {
    const render = await import('../dist/render.js');
    const patch = await import('../dist/fragment-patch.js');
    return {
        graph: 'unbundled-esm',
        applyMarker: render._applyMarkerValue,
        coerceText: render._coerceText,
        createFragment: render._createContextualFragment,
        createRegion: patch.createFragmentRegion,
        sameCoerceIdentity: render._coerceText === patch.coerceText
    };
}

async function loadEmitted() {
    const template = await import('../dist/template.js');
    const snapshot = template.runtimeModuleProfileSnapshot('production-emitted');
    const file = join(tmpdir(), `zenith-runtime-template-bench-${process.pid}.mjs`);
    writeFileSync(file, snapshot.source);
    const emitted = await import(pathToFileURL(file).href);
    const contributors = {};
    for (let i = 0; i < snapshot.contributors.length; i++) {
        const entry = snapshot.contributors[i];
        if (
            entry.sourceFile === 'render.js'
            || entry.sourceFile === 'fragment-patch.js'
            || entry.sourceFile === 'render-utils.js'
        ) {
            contributors[entry.sourceFile] = entry.bytes;
        }
    }
    return {
        graph: 'emitted-production-template',
        applyMarker: emitted._applyMarkerValue,
        coerceText: emitted._coerceText,
        createFragment: emitted._createContextualFragment,
        createRegion: emitted.createFragmentRegion,
        sameCoerceIdentity: emitted._coerceText === emitted.coerceText,
        coverageBytes: snapshot.coverageBytes,
        contributorBytes: contributors,
        moduleFile: file
    };
}

function runGraph(api) {
    const fingerprint = fingerprintFor(api);
    const work = worksFor(api);
    const cases = {
        textMarker: measure(work.textMarker),
        attrMarker: measure(work.attrMarker),
        fragmentTextUpdate: measure(work.fragmentTextUpdate),
        fragmentHtmlUpdate: measure(work.fragmentHtmlUpdate),
        commentHtmlMarker: measure(work.commentHtmlMarker),
        coerceTextDirect: measure(work.coerceTextDirect),
        contextualFragmentDirect: measure(work.contextualFragmentDirect)
    };
    work.cleanup();
    return {
        graph: api.graph,
        sameCoerceIdentity: api.sameCoerceIdentity === true,
        fingerprint,
        coverageBytes: api.coverageBytes ?? null,
        contributorBytes: api.contributorBytes ?? null,
        cases
    };
}

function environment() {
    const cpu = cpus()[0] || { model: 'unknown', speed: 0 };
    return {
        label: LABEL,
        hostname: hostname(),
        platform: platform(),
        arch: arch(),
        release: release(),
        cpuModel: cpu.model,
        cpuSpeedMHz: cpu.speed,
        cpuCount: cpus().length,
        bun: Bun.version,
        node: process.version,
        samples: SAMPLES,
        warmupSamplesDiscarded: 3,
        timer: 'Bun.nanoseconds',
        dom: 'happy-dom via bun-test-setup GlobalRegistrator',
        iterationsPerSample: {
            textMarker: TEXT_ITERS,
            attrMarker: ATTR_ITERS,
            fragmentTextUpdate: FRAGMENT_UPDATES,
            fragmentHtmlUpdate: HTML_FRAGMENT_UPDATES,
            commentHtmlMarker: COMMENT_HTML_UPDATES,
            coerceTextDirect: COERCE_ITERS,
            contextualFragmentDirect: CONTEXT_ITERS
        }
    };
}

const unbundled = await loadUnbundled();
const emitted = await loadEmitted();
const result = {
    environment: environment(),
    graphs: [runGraph(unbundled), runGraph(emitted)]
};

const outFile = process.env.RENDER_BENCH_OUT || '';
if (outFile) writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
