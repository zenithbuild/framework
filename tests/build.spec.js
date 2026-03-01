import { build, createCompilerWarningEmitter } from '../src/build.js';
import { jest } from '@jest/globals';
import { mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

const WORKSPACE_ROOT = join(process.cwd(), '..');

jest.setTimeout(45000);

async function makeProject(files) {
    const root = join(tmpdir(), `zenith-build-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const pagesDir = join(root, 'pages');
    const outDir = join(root, 'dist');
    await mkdir(pagesDir, { recursive: true });

    for (const [file, source] of Object.entries(files)) {
        const fullPath = join(pagesDir, file);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, source, 'utf8');
    }

    return { root, pagesDir, outDir };
}

async function linkWorkspaceNodeModules(projectRoot) {
    const workspaceNodeModules = join(WORKSPACE_ROOT, 'node_modules');
    const target = join(projectRoot, 'node_modules');
    await symlink(workspaceNodeModules, target, 'dir').catch(() => { });
}

async function walkFiles(dir) {
    const out = [];
    async function walk(current) {
        let entries = [];
        try {
            entries = await readdir(current);
        } catch {
            return;
        }

        entries.sort((a, b) => a.localeCompare(b));
        for (const entry of entries) {
            const full = join(current, entry);
            const children = await readdir(full).catch(() => null);
            if (children) {
                await walk(full);
                continue;
            }
            out.push(full);
        }
    }

    await walk(dir);
    out.sort((a, b) => a.localeCompare(b));
    return out;
}

async function findBuiltCssAsset(outDir) {
    const assetsDir = join(outDir, 'assets');
    const entries = await readdir(assetsDir);
    const cssAsset = entries.find((name) => name.startsWith('styles.') && name.endsWith('.css'));
    expect(cssAsset).toBeTruthy();
    return join(assetsDir, String(cssAsset));
}

async function evaluateBuiltModule(source, identifier) {
    const context = createContext({
        console,
        URL,
        URLSearchParams,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => { },
        location: { pathname: '/', href: 'http://localhost/' },
        window: {
            location: { pathname: '/', href: 'http://localhost/' },
            __zenith_ssr_data: {}
        },
        document: {},
        globalThis: undefined
    });
    context.globalThis = context;
    context.global = context;
    context.window.window = context.window;
    context.window.globalThis = context;

    const sharedExports = [
        'default',
        'hydrate',
        'signal',
        'state',
        'ref',
        'zeneffect',
        'zenEffect',
        'zenMount',
        'zenWindow',
        'zenDocument',
        'zenOn',
        'zenResize',
        'collectRefs',
        'createRouter',
        'matchRoute',
        'resolveRequestRoute'
    ];
    const moduleCache = new Map();

    const linker = async (specifier) => {
        if (moduleCache.has(specifier)) {
            return moduleCache.get(specifier);
        }

        const module = new SyntheticModule(
            sharedExports,
            function () {
                const noop = () => { };
                const signalLike = (value) => ({
                    get: () => value,
                    set: noop
                });

                this.setExport('default', {});
                this.setExport('hydrate', noop);
                this.setExport('signal', signalLike);
                this.setExport('state', signalLike);
                this.setExport('ref', () => ({ current: null }));
                this.setExport('zeneffect', noop);
                this.setExport('zenEffect', noop);
                this.setExport('zenMount', noop);
                this.setExport('zenWindow', () => null);
                this.setExport('zenDocument', () => null);
                this.setExport('zenOn', noop);
                this.setExport('zenResize', () => noop);
                this.setExport('collectRefs', (...refs) => refs.map((ref) => ref?.current).filter(Boolean));
                this.setExport('createRouter', () => ({ navigate: noop }));
                this.setExport('matchRoute', () => null);
                this.setExport('resolveRequestRoute', () => null);
            },
            { context, identifier: `stub:${specifier}` }
        );

        moduleCache.set(specifier, module);
        return module;
    };

    const module = new SourceTextModule(source, {
        context,
        identifier
    });

    await module.link(linker);
    await module.evaluate();
}

describe('build orchestration', () => {
    let project;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('spawns compiler and bundler processes to emit route output', async () => {
        project = await makeProject({
            'index.zen': '<main><h1>{title}</h1></main>\n',
            'about.zen': '<main><h1>About</h1></main>\n'
        });

        const result = await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir
        });

        expect(result.pages).toBe(2);
        expect((await readFile(join(project.outDir, 'index.html'), 'utf8')).includes('<!DOCTYPE html>')).toBe(true);
        expect((await readFile(join(project.outDir, 'about/index.html'), 'utf8')).includes('<!DOCTYPE html>')).toBe(true);

        const indexHtml = await readFile(join(project.outDir, 'index.html'), 'utf8');
        expect(indexHtml.includes('<script type="module"')).toBe(true);
        expect(result.assets.some((asset) => asset.endsWith('.js'))).toBe(true);
    });

    test('build output remains stable for identical input', async () => {
        project = await makeProject({
            'index.zen': '<main><p>{count}</p></main>\n',
            'users/[id].zen': '<main><h1>User {params.id}</h1></main>\n'
        });

        const first = await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const filesA = await walkFiles(project.outDir);
        const contentA = await Promise.all(filesA.map((file) => readFile(file, 'utf8')));

        const second = await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const filesB = await walkFiles(project.outDir);
        const contentB = await Promise.all(filesB.map((file) => readFile(file, 'utf8')));

        expect(first.pages).toBe(second.pages);
        expect(first.assets).toEqual(second.assets);
        expect(filesA).toEqual(filesB);
        expect(contentA).toEqual(contentB);
    });

    test('emits .zenith type declarations and updates tsconfig include', async () => {
        project = await makeProject({
            'index.zen': '<script server lang="ts">export const data = { title: "home" };</script><main>{data.title}</main>\n'
        });

        await writeFile(
            join(project.root, 'tsconfig.json'),
            JSON.stringify(
                {
                    compilerOptions: { strict: true },
                    include: ['pages/**/*']
                },
                null,
                2
            )
        );

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });

        const envDts = await readFile(join(project.root, '.zenith', 'zenith-env.d.ts'), 'utf8');
        const routeDts = await readFile(join(project.root, '.zenith', 'zenith-routes.d.ts'), 'utf8');
        const tsconfig = JSON.parse(await readFile(join(project.root, 'tsconfig.json'), 'utf8'));

        expect(envDts.includes('interface LoadContext')).toBe(true);
        expect(routeDts.includes('"/": {}')).toBe(true);
        expect(Array.isArray(tsconfig.include)).toBe(true);
        expect(tsconfig.include.includes('.zenith/**/*.d.ts')).toBe(true);
    });

    test('rejects mixed data and load exports in <script server>', async () => {
        project = await makeProject({
            'index.zen': [
                '<script server lang="ts">',
                'export const data = { ok: true };',
                'export const load = async (ctx) => ({ params: ctx.params });',
                '</script>',
                '<main>bad</main>'
            ].join('\n')
        });

        await expect(build({ pagesDir: project.pagesDir, outDir: project.outDir })).rejects.toThrow(
            'export either data or load(ctx), not both'
        );
    });

    test('rejects load export with invalid arity', async () => {
        project = await makeProject({
            'index.zen': [
                '<script server lang="ts">',
                'export const load = async () => ({ ok: true });',
                '</script>',
                '<main>bad</main>'
            ].join('\n')
        });

        await expect(build({ pagesDir: project.pagesDir, outDir: project.outDir })).rejects.toThrow(
            'load(ctx) must accept exactly one argument'
        );
    });

    test('rejects mixing load with legacy ssr_data export', async () => {
        project = await makeProject({
            'index.zen': [
                '<script server lang="ts">',
                'export const load = async (ctx) => ({ ok: true });',
                'export const ssr_data = { legacy: true };',
                '</script>',
                '<main>bad</main>'
            ].join('\n')
        });

        await expect(build({ pagesDir: project.pagesDir, outDir: project.outDir })).rejects.toThrow(
            'data/load cannot be combined with legacy ssr_data/ssr/props exports'
        );
    });

    test('rejects non-boolean prerender export', async () => {
        project = await makeProject({
            'index.zen': [
                '<script server lang="ts">',
                'export const data = { ok: true };',
                'export const prerender = "yes";',
                '</script>',
                '<main>bad</main>'
            ].join('\n')
        });

        await expect(build({ pagesDir: project.pagesDir, outDir: project.outDir })).rejects.toThrow(
            'prerender must be a boolean literal'
        );
    });

    test('rejects embedded markup expressions when config gate is disabled', async () => {
        project = await makeProject({
            'index.zen': '<main>{cond ? (<a>Hi</a>) : null}</main>\n'
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { embeddedMarkupExpressions: false }
        })
            .then(() => {
                throw new Error('build unexpectedly succeeded');
            })
            .catch((error) => {
                const message = String(error?.message || error);
                expect(message).toContain('Embedded markup expressions are disabled');
                expect(message).not.toContain('Expected RBrace');
                expect(message).not.toContain('found Lt');
            });
    });

    test('allows embedded markup expressions when config gate is enabled', async () => {
        project = await makeProject({
            'index.zen': '<main>{cond ? (<a>Hi</a>) : null}</main>\n'
        });

        const result = await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { embeddedMarkupExpressions: true }
        });

        expect(result.pages).toBe(1);
        expect((await readFile(join(project.outDir, 'index.html'), 'utf8')).includes('<!DOCTYPE html>')).toBe(true);
    });

    test('builds component tags inside embedded markup expressions without leaking expanded internals', async () => {
        const root = join(tmpdir(), `zenith-build-embedded-component-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const componentsDir = join(srcDir, 'components');
        const outDir = join(root, 'dist');
        project = { root, pagesDir, outDir };

        await mkdir(pagesDir, { recursive: true });
        await mkdir(componentsDir, { recursive: true });

        await writeFile(
            join(componentsDir, 'Button.zen'),
            [
                '<script lang="ts">',
                'const cls = "chip";',
                '</script>',
                '<span class="contents">',
                '  {props.href',
                '    ? (',
                '      <a href={props.href} class={cls}>',
                '        <slot />',
                '      </a>',
                '    )',
                '    : (',
                '      <button class={cls}>',
                '        <slot />',
                '      </button>',
                '    )}',
                '</span>'
            ].join('\n'),
            'utf8'
        );

        await writeFile(
            join(pagesDir, 'index.zen'),
            [
                '<script lang="ts">',
                'const items = [{ slug: "getting-started", title: "Getting Started" }];',
                '</script>',
                '<main>',
                '  {items.map((item) => (',
                '    <Button href={"#cat-" + item.slug}>',
                '      {item.title}',
                '    </Button>',
                '  ))}',
                '</main>'
            ].join('\n'),
            'utf8'
        );

        await build({
            pagesDir,
            outDir,
            config: { embeddedMarkupExpressions: true }
        });

        const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8');
        const scriptMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
        expect(scriptMatch).toBeTruthy();
        const scriptPath = String(scriptMatch?.[1] || '').replace(/^\//, '');
        const pageAssetPath = join(outDir, scriptPath);
        const pageAsset = await readFile(pageAssetPath, 'utf8');

        expect(pageAsset.includes('__zenith_fragment(')).toBe(true);
        expect(pageAsset.includes('props.href')).toBe(false);
        expect(pageAsset.includes('<span class="contents">')).toBe(false);

        const syntaxCheck = spawnSync(process.execPath, ['--check', pageAssetPath], { encoding: 'utf8' });
        expect(syntaxCheck.status).toBe(0);
        await expect(evaluateBuiltModule(pageAsset, pageAssetPath)).resolves.toBeUndefined();
    });

    test('build succeeds when used components include <style> blocks', async () => {
        const root = join(tmpdir(), `zenith-build-style-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const componentsDir = join(srcDir, 'components');
        const outDir = join(root, 'dist');
        project = { root, pagesDir, outDir };

        await mkdir(pagesDir, { recursive: true });
        await mkdir(componentsDir, { recursive: true });

        await writeFile(
            join(componentsDir, 'StyledCard.zen'),
            [
                '<script lang="ts">',
                'const count = signal(1);',
                '</script>',
                '<style>',
                '.styled-card { border: 1px solid red; }',
                '</style>',
                '<section class="styled-card">{count}</section>'
            ].join('\n'),
            'utf8'
        );
        await writeFile(
            join(pagesDir, 'index.zen'),
            '<main><StyledCard /></main>\n',
            'utf8'
        );

        const result = await build({ pagesDir, outDir });
        expect(result.pages).toBe(1);
        expect((await readFile(join(outDir, 'index.html'), 'utf8')).includes('<!DOCTYPE html>')).toBe(true);
    });

    test('rewrites component template expressions with script bindings after expansion', async () => {
        const root = join(tmpdir(), `zenith-build-expr-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const componentsDir = join(srcDir, 'components');
        const outDir = join(root, 'dist');
        project = { root, pagesDir, outDir };

        await mkdir(pagesDir, { recursive: true });
        await mkdir(componentsDir, { recursive: true });

        await writeFile(
            join(componentsDir, 'MappedList.zen'),
            [
                '<script lang="ts">',
                'const items = [{ label: "A" }, { label: "B" }];',
                '</script>',
                '<section>',
                '  <ul>{items.map((item) => zenhtml`<li>${item.label}</li>`)}</ul>',
                '</section>'
            ].join('\n'),
            'utf8'
        );

        await writeFile(
            join(pagesDir, 'index.zen'),
            '<main><MappedList /></main>\n',
            'utf8'
        );

        await build({ pagesDir, outDir });
        const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8');
        const scriptMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
        expect(scriptMatch).toBeTruthy();
        const scriptPath = String(scriptMatch?.[1] || '').replace(/^\//, '');
        const pageAsset = await readFile(join(outDir, scriptPath), 'utf8');
        expect(pageAsset.includes('items.map((item)')).toBe(true);
        expect(pageAsset.includes('__ZENITH_INTERNAL_ZENHTML`<li>${')).toBe(true);
        expect(pageAsset.includes('___')).toBe(true);
        expect(pageAsset.includes('"literal":"items.map((item)')).toBe(false);
        expect(/const __zenith_state_keys = \[[^\]]+items/.test(pageAsset)).toBe(true);
    });

    test('preserves component reactive binding metadata after expansion', async () => {
        const root = join(tmpdir(), `zenith-build-component-bindings-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const componentsDir = join(srcDir, 'components');
        const outDir = join(root, 'dist');
        project = { root, pagesDir, outDir };

        await mkdir(pagesDir, { recursive: true });
        await mkdir(componentsDir, { recursive: true });

        await writeFile(
            join(componentsDir, 'ThemeIcon.zen'),
            [
                '<script lang="ts">',
                'state currentTheme = "light";',
                'function toggle() {',
                '  currentTheme = currentTheme === "dark" ? "light" : "dark";',
                '}',
                '</script>',
                '<button',
                '  aria-label={currentTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}',
                '  aria-pressed={currentTheme === "dark" ? "true" : "false"}',
                '  on:click={toggle}',
                '>',
                '  {currentTheme === "dark" ? "🌙" : "☀️"}',
                '</button>'
            ].join('\n'),
            'utf8'
        );

        await writeFile(
            join(pagesDir, 'index.zen'),
            '<main><ThemeIcon /></main>\n',
            'utf8'
        );

        await build({ pagesDir, outDir });
        const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8');
        const scriptMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
        expect(scriptMatch).toBeTruthy();
        const scriptPath = String(scriptMatch?.[1] || '').replace(/^\//, '');
        const pageAsset = await readFile(join(outDir, scriptPath), 'utf8');

        expect(pageAsset).toMatch(/return signalMap\.get\(\d+\)\.get\(\) === "dark" \? "🌙" : "☀️";/);
        expect(pageAsset).toMatch(/return signalMap\.get\(\d+\)\.get\(\) === "dark" \? "Switch to light theme" : "Switch to dark theme";/);
        expect(pageAsset).toMatch(/"signal_indices":\[\d+\]/);
        expect(pageAsset).toMatch(/"state_index":\d+/);
    });

    test('build compiles local tailwind entry css internally', async () => {
        const root = join(tmpdir(), `zenith-build-tailwind-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const stylesDir = join(srcDir, 'styles');
        const outDir = join(root, 'dist');
        project = { root, pagesDir, outDir };

        await mkdir(pagesDir, { recursive: true });
        await mkdir(stylesDir, { recursive: true });
        await linkWorkspaceNodeModules(root);

        await writeFile(
            join(stylesDir, 'global.css'),
            '@import "tailwindcss";\n:root { --zen-cli-tailwind-build: 1; }\n',
            'utf8'
        );

        await writeFile(
            join(pagesDir, 'index.zen'),
            [
                '<script setup="ts">',
                'import "../styles/global.css";',
                '</script>',
                '<main class="text-red-500 font-bold">Home</main>'
            ].join('\n'),
            'utf8'
        );

        await build({ pagesDir, outDir });
        const cssPath = await findBuiltCssAsset(outDir);
        const css = await readFile(cssPath, 'utf8');

        expect(css).not.toContain('@import "tailwindcss"');
        expect(css.includes('.text-red-500') || css.includes('color:var(--color-red-500')).toBe(true);
        expect(css).toContain('--zen-cli-tailwind-build');
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
                '<section>{items.map((item) => zenhtml`<span>${item.label}</span>`)}</section>'
            ].join('\n'),
            'utf8'
        );

        await writeFile(
            join(pagesDir, 'index.zen'),
            '<main><DeferredMap /></main>\n',
            'utf8'
        );

        await build({ pagesDir, outDir });
        const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8');
        const scriptMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
        expect(scriptMatch).toBeTruthy();
        const scriptPath = String(scriptMatch?.[1] || '').replace(/^\//, '');
        const pageAsset = await readFile(join(outDir, scriptPath), 'utf8');

        const stateEntryMatch = pageAsset.match(/"literal":"([A-Za-z0-9_$]+)\.map\(\(item\)/);
        expect(stateEntryMatch).toBeTruthy();
        const hoistedItemIdent = stateEntryMatch?.[1];
        expect(typeof hoistedItemIdent).toBe('string');
        expect(pageAsset).toMatch(new RegExp(`(?:var|const|let) ${hoistedItemIdent} = \\[\{`));

        const declarationMatch = pageAsset.match(new RegExp(`(?:var|const|let) ${hoistedItemIdent} = \\[\{`));
        const declarationIndex = declarationMatch ? declarationMatch.index : -1;
        const bootstrapIndex = pageAsset.indexOf('__zenith_component_bootstraps.push(() => {');
        expect(declarationIndex).toBeGreaterThanOrEqual(0);
        expect(bootstrapIndex).toBeGreaterThanOrEqual(0);
        expect(declarationIndex).toBeLessThan(bootstrapIndex);
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

        expect(pageAsset).toMatch(/(?:var|const|let) props = \{ pageTitle: "About Page" \};/);
        expect(pageAsset.includes('"literal":"resolvedTitle"')).toBe(false);
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

        expect(pageAsset).toContain('const __zenith_refs = [');
        expect(pageAsset).not.toContain('const __zenith_refs = [];');
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

        const keysMatch = pageAsset.match(/const __zenith_state_keys = (\[[\s\S]*?\]);/);
        expect(keysMatch).toBeTruthy();
        const stateKeys = JSON.parse(String(keysMatch?.[1] || '[]'));
        expect(stateKeys.some((key) => String(key).includes('runtimePreferred'))).toBe(false);
        expect(stateKeys.some((key) => String(key).includes('frameId'))).toBe(false);

        const syntaxCheck = spawnSync(process.execPath, ['--check', pageAssetPath], { encoding: 'utf8' });
        expect(syntaxCheck.status).toBe(0);
        expect(String(syntaxCheck.stderr || '')).toBe('');

        await expect(evaluateBuiltModule(pageAsset, pageAssetPath)).resolves.toBeUndefined();
    });

    test('prints compiler warnings during build for unknown events', async () => {
        project = await makeProject({
            'index.zen': [
                '<script lang="ts">',
                'function handleClick() {}',
                '</script>',
                '<button on:clcik={handleClick}>Tap</button>'
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
        expect(warned.some((line) => line.includes("Did you mean 'click'?"))).toBe(true);
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

        // Drift killer: CLI must never inject these. Framework (router, runtime) may use root.getElementById etc.
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

        emit('a.zen:1:2: warning[ZEN-EVT-UNKNOWN] Unknown DOM event \'clcik\'. Did you mean \'click\'?');
        emit('a.zen:1:2: warning[ZEN-EVT-UNKNOWN] Unknown DOM event \'clcik\'. Did you mean \'click\'?');
        emit('a.zen:2:2: warning[ZEN-EVT-UNKNOWN] Unknown DOM event \'clcik\'. Did you mean \'click\'?');

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
