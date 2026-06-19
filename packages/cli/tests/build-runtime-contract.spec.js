import { build, createCompilerWarningEmitter } from '../dist/build.js';
import { jest } from '@jest/globals';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { evaluateBuiltModule, makeProject } from './helpers/build-fixtures.js';

jest.setTimeout(45000);

describe('build runtime contract', () => {
    let project;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('keeps hoisted declarations at module scope while deferring zenMount/zenEffect calls', async () => {
        const root = join(tmpdir(), `zenith-build-defer-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const componentsDir = join(srcDir, 'components');
        const outDir = join(root, 'dist');
        project = { root, pagesDir, outDir };

        await mkdir(pagesDir, { recursive: true });
        await mkdir(componentsDir, { recursive: true });

        await writeFile(
            join(componentsDir, 'DeferredMap.zen'),
            [
                '<script lang="ts">',
                'const items = [{ label: "A" }, { label: "B" }];',
                'const ready = signal(false);',
                'zenMount(() => { ready.set(true); });',
                '</script>',
                '<section>{items.map((item) => (<span>{item.label}</span>))}</section>'
            ].join('\n'),
            'utf8'
        );

        await writeFile(
            join(pagesDir, 'index.zen'),
            '<main><DeferredMap /></main>\n',
            'utf8'
        );

        await build({ pagesDir, outDir, config: { embeddedMarkupExpressions: true } });
        const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8');
        const scriptMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
        expect(scriptMatch).toBeTruthy();
        const scriptPath = String(scriptMatch?.[1] || '').replace(/^\//, '');
        const pageAsset = await readFile(join(outDir, scriptPath), 'utf8');

        const declarationMatch = pageAsset.match(
            /(?:var|const|let)\s+([A-Za-z0-9_$]+)\s*=\s*\[\{\s*label:\s*["']A["']/
        );
        expect(declarationMatch).toBeTruthy();
        const declarationIndex = declarationMatch ? declarationMatch.index : -1;
        const mountIndex = pageAsset.indexOf('zenMount(');
        expect(declarationIndex).toBeGreaterThanOrEqual(0);
        expect(mountIndex).toBeGreaterThanOrEqual(0);
        expect(declarationIndex).toBeLessThan(mountIndex);
        expect(pageAsset).toMatch(/zenMount\((?:(?:function\s*\(\)\s*\{)|\(\)\s*=>\s*\{)/);
    });

    test('injects document-mode props so layout expressions do not render raw literals', async () => {
        const root = join(tmpdir(), `zenith-build-docmode-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
        const scriptMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
        expect(scriptMatch).toBeTruthy();
        const scriptPath = String(scriptMatch?.[1] || '').replace(/^\//, '');
        const pageAsset = await readFile(join(outDir, scriptPath), 'utf8');

        expect(pageAsset).toMatch(/(?:var|const|let)\s+props\s*=\s*\{\s*pageTitle:\s*['"]About Page['"]\s*\};/);
        expect(pageAsset.includes('resolvedTitle')).toBe(true);
    });

    test('resolves propagated layout refs without colliding with nested prop aliases', async () => {
        const root = join(tmpdir(), `zenith-build-propagated-ref-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const layoutsDir = join(srcDir, 'layouts');
        const footerDir = join(srcDir, 'components', 'globals', 'footer');
        const outDir = join(root, 'dist');
        project = { root, pagesDir, outDir };

        await mkdir(pagesDir, { recursive: true });
        await mkdir(layoutsDir, { recursive: true });
        await mkdir(footerDir, { recursive: true });

        await writeFile(
            join(layoutsDir, 'RootLayout.zen'),
            [
                '<script lang="ts">',
                'import Footer from "../components/globals/footer/Footer.zen";',
                'const mainRef = ref<HTMLElement>();',
                '</script>',
                '<div>',
                '  <main ref={mainRef}><slot /></main>',
                '  <Footer mainRef={mainRef} />',
                '</div>'
            ].join('\n'),
            'utf8'
        );

        await writeFile(
            join(footerDir, 'Footer.zen'),
            [
                '<script lang="ts">',
                'import FooterCurvedText from "./FooterCurvedText.zen";',
                'const incoming = props;',
                'const mainRef = incoming.mainRef ?? { current: null };',
                'const footerRef = ref<HTMLElement>();',
                '</script>',
                '<footer ref={footerRef}>',
                '  <FooterCurvedText mainRef={mainRef} footerRef={footerRef} />',
                '</footer>'
            ].join('\n'),
            'utf8'
        );

        await writeFile(
            join(footerDir, 'FooterCurvedText.zen'),
            [
                '<script lang="ts">',
                'const incoming = props;',
                'const mainRef = incoming.mainRef ?? { current: null };',
                'const footerRef = incoming.footerRef ?? { current: null };',
                'const refPath = ref<SVGPathElement>();',
                '</script>',
                '<svg><path ref={refPath}></path></svg>'
            ].join('\n'),
            'utf8'
        );

        await writeFile(
            join(pagesDir, 'index.zen'),
            '<RootLayout><section>ok</section></RootLayout>\n',
            'utf8'
        );

        await expect(build({ pagesDir, outDir })).resolves.toMatchObject({ pages: 1 });

        const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8');
        const scriptMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
        expect(scriptMatch).toBeTruthy();
        const scriptPath = String(scriptMatch?.[1] || '').replace(/^\//, '');
        const pageAsset = await readFile(join(outDir, scriptPath), 'utf8');

        expect(pageAsset).toMatch(/const\s+__zenith_refs\s*=\s*\[(?!\s*\])/);
    });

    test('keeps function-local zenEffect/zenMount variables out of module state table and evaluates cleanly', async () => {
        project = await makeProject({
            'index.zen': [
                '<script lang="ts">',
                'const theme = signal("light");',
                'function resolvePreferredTheme() {',
                '  const runtimePreferred = globalThis;',
                '  const saved = runtimePreferred?.localStorage?.getItem("zenith-theme");',
                '  return saved === "dark" ? "dark" : "light";',
                '}',
                'function applyTheme(nextTheme) {',
                '  theme.set(nextTheme);',
                '}',
                'zenEffect(() => {',
                '  const frameId = requestAnimationFrame(() => {});',
                '  return () => cancelAnimationFrame(frameId);',
                '});',
                'zenMount(() => {',
                '  applyTheme(resolvePreferredTheme());',
                '});',
                '</script>',
                '<main>{theme.get()}</main>'
            ].join('\n')
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });

        const indexHtml = await readFile(join(project.outDir, 'index.html'), 'utf8');
        const scriptMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
        expect(scriptMatch).toBeTruthy();
        const scriptPath = String(scriptMatch?.[1] || '').replace(/^\//, '');
        const pageAssetPath = join(project.outDir, scriptPath);
        const pageAsset = await readFile(pageAssetPath, 'utf8');

        const keysMatch = pageAsset.match(/const\s+__zenith_state_keys\s*=\s*(\[[\s\S]*?\]);/);
        expect(keysMatch).toBeTruthy();
        const stateKeysLiteral = String(keysMatch?.[1] || '');
        expect(stateKeysLiteral).not.toContain('runtimePreferred');
        expect(stateKeysLiteral).not.toContain('frameId');

        const syntaxCheck = spawnSync(process.execPath, ['--check', pageAssetPath], { encoding: 'utf8' });
        expect(syntaxCheck.status).toBe(0);
        expect(String(syntaxCheck.stderr || '')).toBe('');

        await expect(evaluateBuiltModule(pageAsset, pageAssetPath)).resolves.toBeUndefined();
    });

    test.each([
        ['click typo', 'clcik', "Did you mean 'click'?"],
        ['double-click typo', 'dbclick', "Did you mean 'dblclick'?"]
    ])('prints compiler warnings during build for unknown events: %s', async (_label, eventName, suggestion) => {
        project = await makeProject({
            'index.zen': [
                '<script lang="ts">',
                'function handleClick() {}',
                '</script>',
                `<button on:${eventName}={handleClick}>Tap</button>`
            ].join('\n')
        });

        const warned = [];
        const originalWarn = console.warn;
        console.warn = (...args) => {
            warned.push(args.map((arg) => String(arg)).join(' '));
        };

        try {
            await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        } finally {
            console.warn = originalWarn;
        }

        expect(warned.some((line) => line.includes('warning[ZEN-EVT-UNKNOWN]'))).toBe(true);
        expect(warned.some((line) => line.includes(suggestion))).toBe(true);
    });

    test('emitted JS never contains injected querySelector/addEventListener fallbacks (drift killer)', async () => {
        project = await makeProject({
            'index.zen': [
                '<script lang="ts">',
                'const navRef = ref<HTMLElement>();',
                'zenMount((ctx) => { ctx.cleanup(() => {}); });',
                '</script>',
                '<main><nav ref={navRef}>Nav</nav></main>'
            ].join('\n')
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });

        const manifestPath = join(project.outDir, 'manifest.json');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        const chunkPaths = Object.values(manifest.chunks || {});

        const forbidden = [
            /document\.querySelector\s*\(/,
            /document\.querySelectorAll\s*\(/,
            /document\.getElementById\s*\(/
        ];

        for (const chunkRel of chunkPaths) {
            const chunkPath = join(project.outDir, chunkRel.replace(/^\//, ''));
            const content = await readFile(chunkPath, 'utf8');
            for (const pattern of forbidden) {
                expect(content).not.toMatch(pattern);
            }
        }

        const componentsDir = join(project.outDir, 'assets', 'components');
        let componentFiles = [];
        try {
            const entries = await readdir(componentsDir, { withFileTypes: true });
            componentFiles = entries
                .filter((e) => e.isFile() && e.name.endsWith('.js'))
                .map((e) => join(componentsDir, e.name));
        } catch {
            // No components dir is fine
        }
        for (const file of componentFiles) {
            const content = await readFile(file, 'utf8');
            for (const pattern of forbidden) {
                expect(content).not.toMatch(pattern);
            }
        }
    });

    test('deduplicates repeated compiler warning lines in one build pass', () => {
        const warned = [];
        const emit = createCompilerWarningEmitter((line) => warned.push(line));

        const cases = [
            'a.zen:1:2: warning[ZEN-EVT-UNKNOWN] Unknown DOM event \'clcik\'. Did you mean \'click\'?',
            'a.zen:1:2: warning[ZEN-EVT-UNKNOWN] Unknown DOM event \'clcik\'. Did you mean \'click\'?',
            'a.zen:2:2: warning[ZEN-EVT-UNKNOWN] Unknown DOM event \'clcik\'. Did you mean \'click\'?',
            'a.zen:2:2: warning[ZEN-EVT-UNKNOWN] Unknown DOM event \'clcik\'. Did you mean \'click\'?'
        ];

        for (const line of cases) {
            emit(line);
        }

        expect(warned).toEqual([
            'a.zen:1:2: warning[ZEN-EVT-UNKNOWN] Unknown DOM event \'clcik\'. Did you mean \'click\'?',
            'a.zen:2:2: warning[ZEN-EVT-UNKNOWN] Unknown DOM event \'clcik\'. Did you mean \'click\'?'
        ]);
    });

    test('internal template recompiles do not duplicate component warning output', async () => {
        const root = join(tmpdir(), `zenith-build-warning-suppress-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const componentsDir = join(srcDir, 'components');
        const outDir = join(root, 'dist');
        project = { root, pagesDir, outDir };

        await mkdir(pagesDir, { recursive: true });
        await mkdir(componentsDir, { recursive: true });

        await writeFile(
            join(componentsDir, 'TypoButton.zen'),
            [
                '<script lang="ts">',
                'function handleClick() {}',
                '</script>',
                '<button on:clcik={handleClick}><slot /></button>'
            ].join('\n'),
            'utf8'
        );

        await writeFile(
            join(pagesDir, 'index.zen'),
            '<main><TypoButton>One</TypoButton><TypoButton>Two</TypoButton></main>\n',
            'utf8'
        );

        const warned = [];
        const originalWarn = console.warn;
        console.warn = (...args) => {
            warned.push(args.map((arg) => String(arg)).join(' '));
        };

        try {
            await build({ pagesDir, outDir });
        } finally {
            console.warn = originalWarn;
        }

        const componentWarnings = warned.filter(
            (line) => line.includes('TypoButton.zen') && line.includes('warning[ZEN-EVT-UNKNOWN]')
        );
        expect(componentWarnings.length).toBe(1);
    });
});
