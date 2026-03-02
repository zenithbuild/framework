// Zenith Site V0 — Playwright Acceptance Gate
// Validates: vendor bundle, ScrollTrigger stability, hero SVG styles,
// SplitText nodes, runtime markers, and nav loop determinism.
//
// Usage:
//   1. npm run build (in zenith-site-v0)
//   2. npm run dev (must serve on http://localhost:4000)
//   3. node --input-type=module scripts/acceptance.mjs

import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';

const distAssets = '/Users/judahsullivan/Personal/zenith/zenith-site-v0/dist/assets';
const baseUrl = 'http://localhost:4000';

const vendorFile = readdirSync(distAssets).find((name) => /^vendor\..+\.js$/.test(name));
if (!vendorFile) throw new Error('vendor bundle not found');

const vendorSpecifier = `/assets/${vendorFile}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const consoleErrors = [];
const pageErrors = [];
const failedResponses = [];

page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => {
    pageErrors.push(err?.message || String(err));
});
page.on('response', (res) => {
    if (res.status() >= 400) failedResponses.push({ status: res.status(), url: res.url() });
});

async function collectHomeStats() {
    return await page.evaluate(async ({ vendorSpecifier }) => {
        const vendor = await import(vendorSpecifier);
        const ScrollTrigger = vendor.ScrollTrigger;

        const triggers = ScrollTrigger.getAll();
        const triggerStarts = triggers.map((trigger) => {
            const start = trigger?.vars?.start;
            return typeof start === 'function' ? '[function]' : String(start ?? '');
        });

        const heroPaths = Array.from(document.querySelectorAll('[data-hero-watermark] svg path'));
        const heroFirstStyle = heroPaths[0] ? getComputedStyle(heroPaths[0]) : null;
        const heroWatermark = document.querySelector('[data-hero-watermark]');

        const titleCharCount = document.querySelectorAll(
            '[data-hero-title] .char, [data-philosophy-title] .char, [data-bindings-title] .char, [data-reactive-title] .char, [data-cta-title] .char'
        ).length;

        const lineMaskCount = document.querySelectorAll(
            '[data-hero-line] .line, [data-philosophy-paragraph] .line, [data-bindings-line] .line, [data-reactive-line] .line, [data-cta-line] .line'
        ).length;

        const header = document.querySelector('header');
        const footer = document.querySelector('footer');

        return {
            pathName: window.location.pathname,
            triggerCount: triggers.length,
            triggerStarts,
            heroPathCount: heroPaths.length,
            heroFirstStrokeDasharray: heroFirstStyle ? heroFirstStyle.strokeDasharray : null,
            heroFirstStrokeDashoffset: heroFirstStyle ? heroFirstStyle.strokeDashoffset : null,
            heroFirstFill: heroFirstStyle ? heroFirstStyle.fill : null,
            heroWatermarkOpacity: heroWatermark
                ? Number.parseFloat(getComputedStyle(heroWatermark).opacity || '0')
                : null,
            titleCharCount,
            lineMaskCount,
            headerPosition: header ? getComputedStyle(header).position : null,
            footerMinHeight: footer ? getComputedStyle(footer).minHeight : null,
            footerBorderTopWidth: footer ? getComputedStyle(footer).borderTopWidth : null,
            runtimeMarkers: {
                hero: !!document.querySelector('[data-hero-runtime]'),
                philosophy: !!document.querySelector('[data-philosophy-runtime]'),
                bindings: !!document.querySelector('[data-bindings-runtime]'),
                reactive: !!document.querySelector('[data-reactive-runtime]'),
                cta: !!document.querySelector('[data-cta-runtime]')
            }
        };
    }, { vendorSpecifier });
}

await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2800);

const homeInitial = await collectHomeStats();

const navLoopCounts = [];
for (let i = 0; i < 3; i += 1) {
    await page.goto(`${baseUrl}/docs`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    const docCount = await page.evaluate(async ({ vendorSpecifier }) => {
        const vendor = await import(vendorSpecifier);
        return vendor.ScrollTrigger.getAll().length;
    }, { vendorSpecifier });

    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    const homeStats = await collectHomeStats();
    navLoopCounts.push({
        iteration: i + 1,
        doc: docCount,
        home: homeStats.triggerCount,
        lineMaskCount: homeStats.lineMaskCount,
        titleCharCount: homeStats.titleCharCount
    });
}

await browser.close();

const referenceErrors = [...consoleErrors, ...pageErrors].filter((msg) => /ReferenceError/i.test(msg));

console.log(JSON.stringify({
    vendorFile,
    homeInitial,
    navLoopCounts,
    failedResponses,
    consoleErrors,
    pageErrors,
    referenceErrors
}, null, 2));
