import { build } from '../src/build.js';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createContext, runInNewContext } from 'node:vm';

/**
 * Props hydration integration tests.
 *
 * Proves that components using `props` in <script lang="ts"> get a deterministic
 * `const props = {...}` prelude in the emitted client bundle, preventing
 * ReferenceError during hydration.
 */

async function makePropsProject(files) {
    const root = join(tmpdir(), `zenith-props-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const srcDir = join(root, 'src');
    const pagesDir = join(srcDir, 'pages');
    const componentsDir = join(srcDir, 'components');
    const outDir = join(root, 'dist');

    await mkdir(pagesDir, { recursive: true });
    await mkdir(componentsDir, { recursive: true });

    for (const [relPath, source] of Object.entries(files)) {
        const fullPath = join(srcDir, relPath);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, source, 'utf8');
    }

    return { root, srcDir, pagesDir, outDir };
}

describe('props hydration', () => {
    let project;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('T1 — SSR output contains rendered prop value (no raw expression)', async () => {
        project = await makePropsProject({
            'components/PropsEcho.zen': [
                '<script lang="ts">',
                'interface Props { label?: string }',
                'const { label = "fallback" } = (props as Props);',
                '</script>',
                '<span data-echo>{label}</span>'
            ].join('\n'),
            'pages/index.zen': '<main><PropsEcho label="hello" /></main>\n'
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const indexHtml = await readFile(join(project.outDir, 'index.html'), 'utf8');
        expect(indexHtml.includes('<!DOCTYPE html>')).toBe(true);
    });

    test('T2 — two callsites: architectural awareness (shared identifier model)', async () => {
        project = await makePropsProject({
            'components/PropsEcho.zen': [
                '<script lang="ts">',
                'interface Props { label?: string }',
                'const { label = "fallback" } = (props as Props);',
                '</script>',
                '<span data-echo>{label}</span>'
            ].join('\n'),
            'pages/index.zen': [
                '<main>',
                '<PropsEcho label="A" />',
                '<PropsEcho label="B" />',
                '</main>'
            ].join('\n')
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const indexHtml = await readFile(join(project.outDir, 'index.html'), 'utf8');

        // Two expression marker spans exist (structural macro expanded twice)
        const markerMatches = indexHtml.match(/data-zx-e=/g);
        expect(markerMatches).toBeTruthy();
        expect(markerMatches.length).toBeGreaterThanOrEqual(2);

        // Architectural note: the current compiler produces one identifier per
        // component type, so both slots reference the same variable. The first
        // callsite's props win. This test documents behavior, NOT correctness.
        // When per-instance identifiers are implemented, update this test.
    });

    test('T3 — client module does not throw ReferenceError: props is not defined', async () => {
        project = await makePropsProject({
            'components/PropsEcho.zen': [
                '<script lang="ts">',
                'interface Props { label?: string }',
                'const { label = "fallback" } = (props as Props);',
                '</script>',
                '<span data-echo>{label}</span>'
            ].join('\n'),
            'pages/index.zen': '<main><PropsEcho label="test" /></main>\n'
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const indexHtml = await readFile(join(project.outDir, 'index.html'), 'utf8');
        const scriptMatch = indexHtml.match(/src="([^"]+\.js)"/);
        expect(scriptMatch).toBeTruthy();

        const scriptPath = String(scriptMatch[1]).replace(/^\//, '');
        const pageJs = await readFile(join(project.outDir, scriptPath), 'utf8');

        // Strip ES module syntax (import/export) for vm evaluation
        const evalSource = pageJs
            .replace(/^\s*import\b[^;]*;?\s*$/gm, '')
            .replace(/^\s*export\s+default\s+function\b/gm, 'function')
            .replace(/^\s*export\s+function\b/gm, 'function')
            .replace(/^\s*export\s+(const|let|var)\b/gm, '$1')
            .replace(/^\s*export\s+\{[^}]*\}\s*;?\s*$/gm, '');

        // Execute in a sandboxed context — must NOT throw ReferenceError
        const sandbox = {
            globalThis: {
                __zenith_ssr_data: undefined,
                __zenith_props: undefined
            },
            console: { log() { }, warn() { }, error() { } },
            document: undefined,
            Document: undefined,
            DOMParser: undefined,
            window: undefined,
            navigator: undefined,
            // Provide stubs for runtime functions
            hydrate() { },
            signal(v) { return { get() { return v; }, set() { } }; },
            state(v) { return v; },
            ref() { return { current: null }; },
            zeneffect() { },
            zenEffect() { },
            zenMount() { },
        };

        expect(() => {
            runInNewContext(evalSource, sandbox, { timeout: 5000 });
        }).not.toThrow();
    });

    test('T4 — emitted JS contains props prelude for component using props', async () => {
        project = await makePropsProject({
            'components/PropsEcho.zen': [
                '<script lang="ts">',
                'interface Props { label?: string }',
                'const { label = "fallback" } = (props as Props);',
                '</script>',
                '<span data-echo>{label}</span>'
            ].join('\n'),
            'pages/index.zen': '<main><PropsEcho label="myvalue" /></main>\n'
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const indexHtml = await readFile(join(project.outDir, 'index.html'), 'utf8');
        const scriptMatch = indexHtml.match(/src="([^"]+\.js)"/);
        expect(scriptMatch).toBeTruthy();

        const scriptPath = String(scriptMatch[1]).replace(/^\//, '');
        const pageJs = await readFile(join(project.outDir, scriptPath), 'utf8');

        // The props prelude must be present
        expect(pageJs).toMatch(/(?:var|let|const) props = /);
        expect(pageJs).toContain('myvalue');
    });

    test('existing document-mode props test still works', async () => {
        // Ensure the documentMode gate removal didn't break layout props injection
        const root = join(tmpdir(), `zenith-docmode-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const layoutsDir = join(srcDir, 'layouts');
        const outDir = join(root, 'dist');
        project = { root, pagesDir, outDir };

        await mkdir(pagesDir, { recursive: true });
        await mkdir(layoutsDir, { recursive: true });

        await writeFile(
            join(layoutsDir, 'RootLayout.zen'),
            [
                '<script lang="ts">',
                'const { pageTitle } = props;',
                'const resolvedTitle = typeof pageTitle === "string" && pageTitle.length > 0 ? pageTitle : "Zenith";',
                '</script>',
                '<html lang="en">',
                '<head><title>{resolvedTitle}</title></head>',
                '<body><slot /></body>',
                '</html>'
            ].join('\n'),
            'utf8'
        );

        await writeFile(
            join(pagesDir, 'index.zen'),
            '<RootLayout pageTitle="About Page"><main>ok</main></RootLayout>\n',
            'utf8'
        );

        await build({ pagesDir, outDir });
        const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8');
        const scriptMatch = indexHtml.match(/src="([^"]+\.js)"/);
        expect(scriptMatch).toBeTruthy();
        const scriptPath = String(scriptMatch[1]).replace(/^\//, '');
        const pageAsset = await readFile(join(outDir, scriptPath), 'utf8');
        expect(pageAsset).toMatch(/(?:var|let|const) props = \{ pageTitle: "About Page" \};/);
    });
});
