import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from '../dist/build.js';
import { collectFiles, REPO_ROOT, scanFiles } from './helpers/drift-gates-fixtures.js';

const FRAMEWORK_RUNTIME_TARGETS = [
    resolve(REPO_ROOT, 'packages/router/src'),
    resolve(REPO_ROOT, 'packages/bundler/src'),
    resolve(REPO_ROOT, 'packages/router/template.js'),
    resolve(REPO_ROOT, 'packages/runtime/src')
];

const FRAMEWORK_SOURCE_TARGETS = [
    resolve(REPO_ROOT, 'packages/cli/src'),
    resolve(REPO_ROOT, 'packages/runtime/src'),
    resolve(REPO_ROOT, 'packages/router/src'),
    resolve(REPO_ROOT, 'packages/bundler/src'),
    resolve(REPO_ROOT, 'packages/compiler/zenith_compiler/src')
];

const BARE_ZENHTML_TARGETS = [
    resolve(REPO_ROOT, 'packages/cli/src'),
    resolve(REPO_ROOT, 'packages/runtime/src'),
    resolve(REPO_ROOT, 'packages/router/src'),
    resolve(REPO_ROOT, 'apps/smoke-test/src')
];

function runtimeFiles(targets) {
    return targets.flatMap((pathStr) => {
        return pathStr.endsWith('.js') ? [pathStr] : collectFiles(pathStr, ['.js', '.ts', '.rs']);
    });
}

describe('drift framework guardrails', () => {
    test('framework sources do not import React or jsx-runtime', () => {
        const files = FRAMEWORK_SOURCE_TARGETS.flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.rs']));
        const hits = scanFiles(
            files,
            /\breact\/jsx-runtime\b|\bfrom\s+['"]react['"]|\bimport\s+React(?:\s|,|$)/
        );
        expect(hits).toEqual([]);
    });

    test('query-param SSR channel remains removed', () => {
        const files = [
            resolve(REPO_ROOT, 'packages/cli/src'),
            resolve(REPO_ROOT, 'packages/runtime/src'),
            resolve(REPO_ROOT, 'packages/router/src'),
            resolve(REPO_ROOT, 'packages/bundler/src')
        ].flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.rs']));
        const hits = scanFiles(files, /__zenith_ssr=/);
        expect(hits).toEqual([]);
    });

    test('no pushState or replaceState soft-nav escapes into the router runtime', () => {
        const files = runtimeFiles(FRAMEWORK_RUNTIME_TARGETS);
        const hits = scanFiles(files, /history\.(?:push|replace)State(?!\s*\(\s*null\s*,\s*["']["']\s*,\s*window\.location\.href\s*\))/);
        expect(hits).toEqual([]);
    });

    test('no eval or Function constructors in framework runtime outputs', () => {
        const files = runtimeFiles(FRAMEWORK_RUNTIME_TARGETS);
        const hits = scanFiles(files, /\beval\(|\bnew\s+Function\(|\bFunction\(/);
        expect(hits).toEqual([]);
    });

    test('dist bundles restrict routing/runtime primitives to the documented surfaces', async () => {
        const root = await mkdtemp(join(tmpdir(), 'zenith-drift-gates-'));
        const pagesDir = join(root, 'pages');
        const outDir = join(root, 'dist');

        try {
            await mkdir(pagesDir, { recursive: true });
            await writeFile(
                join(pagesDir, 'index.zen'),
                '<html><head></head><body><a data-zen-link="true" href="/about">About</a></body></html>',
                'utf8'
            );
            await writeFile(
                join(pagesDir, 'about.zen'),
                '<html><head></head><body><h1>About</h1></body></html>',
                'utf8'
            );

            await build({ pagesDir, outDir, config: { router: true } });

            const files = collectFiles(outDir, ['.js']);
            const forbiddenHits = scanFiles(
                files,
                /\beval\(|\bnew\s+Function\(|\bFunction\(|__zenith_ssr=/
            );
            expect(forbiddenHits).toEqual([]);

            const historyHits = scanFiles(files, /history\.(?:push|replace)State/);
            expect(historyHits.length).toBeGreaterThan(0);
            expect(historyHits.every((file) => /[/\\]assets[/\\]router\./.test(file))).toBe(true);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test('app source does not include frozen cms snapshots or svelte block tags', () => {
        const appSrc = resolve(REPO_ROOT, 'apps/smoke-test/src');
        const files = collectFiles(appSrc, ['.zen', '.ts', '.js']);

        const snapshotHits = scanFiles(
            files,
            /Object\.freeze\(\s*\[|cmsDocs|cmsPosts/
        );
        expect(snapshotHits).toEqual([]);

        const svelteHits = scanFiles(
            files.filter((file) => file.endsWith('.zen')),
            /\{#(if|each)|\{:(else|elseif)|\{\/(if|each)/
        );
        expect(svelteHits).toEqual([]);
    });

    test('no use of Object.freeze across app or framework source (except runtime)', () => {
        const targets = [
            resolve(REPO_ROOT, 'packages/cli/src'),
            resolve(REPO_ROOT, 'packages/router/src'),
            resolve(REPO_ROOT, 'packages/bundler/src'),
            resolve(REPO_ROOT, 'apps/smoke-test/src')
        ];
        const files = targets.flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.rs', '.zen']));
        const hits = scanFiles(files, /Object\.freeze\(/);
        expect(hits).toEqual([]);
    });

    test('no use of bare zenhtml macro across the framework or app', () => {
        const files = BARE_ZENHTML_TARGETS.flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.zen']));
        const hits = scanFiles(files, /(^|[^\w.])zenhtml\s*`/m);
        expect(hits).toEqual([]);
    });

    test('no site specifics or cms leakage in core tooling', () => {
        const files = FRAMEWORK_SOURCE_TARGETS.flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.rs']));
        const hits = scanFiles(files, /Directus|docs_pages|cmsDocs|cmsPosts/i);
        expect(hits).toEqual([]);
    });
});
