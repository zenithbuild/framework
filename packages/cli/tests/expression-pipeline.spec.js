import { build } from '../dist/build.js';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

jest.setTimeout(45000);

const WORKSPACE_ROOT = join(process.cwd(), '..');
const COMPILER_BIN = join(
    WORKSPACE_ROOT,
    'compiler',
    'target',
    'release',
    process.platform === 'win32' ? 'zenith-compiler.exe' : 'zenith-compiler'
);
const BUNDLER_BIN = join(
    WORKSPACE_ROOT,
    'bundler',
    'target',
    'release',
    process.platform === 'win32' ? 'zenith-bundler.exe' : 'zenith-bundler'
);
const ORIGINAL_COMPILER_BIN = process.env.ZENITH_COMPILER_BIN;
const ORIGINAL_BUNDLER_BIN = process.env.ZENITH_BUNDLER_BIN;

async function makeWorkspaceProject(files) {
    const root = join(tmpdir(), `zenith-expression-pipeline-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const pagesDir = join(root, 'src', 'pages');
    const outDir = join(root, 'dist');
    await mkdir(pagesDir, { recursive: true });

    for (const [file, source] of Object.entries(files)) {
        const fullPath = join(root, file);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, source, 'utf8');
    }

    return { root, pagesDir, outDir };
}

async function readBuiltPageAsset(outDir, route = 'index.html') {
    const html = await readFile(join(outDir, route), 'utf8');
    const scriptMatch = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
    expect(scriptMatch).toBeTruthy();
    const scriptPath = String(scriptMatch?.[1] || '').replace(/^\//, '');
    return readFile(join(outDir, scriptPath), 'utf8');
}

async function readBuiltRuntimeAsset(outDir) {
    const assetsDir = join(outDir, 'assets');
    const entries = await readdir(assetsDir);
    const runtimeFile = entries.find((name) => name.startsWith('runtime.') && name.endsWith('.js'));
    expect(runtimeFile).toBeTruthy();
    return readFile(join(assetsDir, String(runtimeFile)), 'utf8');
}

function extractExpressionBindings(asset) {
    const match = asset.match(/const __zenith_expression_bindings = (\[[\s\S]*?\]);/);
    expect(match).toBeTruthy();
    return JSON.parse(String(match?.[1] || '[]'));
}

describe('expression pipeline regressions', () => {
    let project = null;

    beforeEach(() => {
        process.env.ZENITH_COMPILER_BIN = COMPILER_BIN;
        process.env.ZENITH_BUNDLER_BIN = BUNDLER_BIN;
    });

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
        if (ORIGINAL_COMPILER_BIN === undefined) {
            delete process.env.ZENITH_COMPILER_BIN;
        } else {
            process.env.ZENITH_COMPILER_BIN = ORIGINAL_COMPILER_BIN;
        }
        if (ORIGINAL_BUNDLER_BIN === undefined) {
            delete process.env.ZENITH_BUNDLER_BIN;
        } else {
            process.env.ZENITH_BUNDLER_BIN = ORIGINAL_BUNDLER_BIN;
        }
    });

    test('does not rewrite plain const member access into signalMap reads after component expansion', async () => {
        project = await makeWorkspaceProject({
            'src/components/PlainPanel.zen': [
                '<script lang="ts">',
                'interface Props {',
                '  content: { title: string };',
                '}',
                'state title = "signal title";',
                'const contractContent = (props as Props).content;',
                '</script>',
                '<section>{contractContent.title}</section>'
            ].join('\n'),
            'src/pages/index.zen': [
                '<script lang="ts">',
                'const payload = { title: "const title" };',
                '</script>',
                '<main><PlainPanel content={payload} /></main>'
            ].join('\n')
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const pageAsset = await readBuiltPageAsset(project.outDir);

        expect(pageAsset).toContain('contractContent.title');
        expect(pageAsset).not.toMatch(/signalMap\.get\(\d+\)\.get\(\)\.title/);
    });

    test('emits fn_index expressions against __ctx.fragment tags instead of __zenith_fragment aliases', async () => {
        project = await makeWorkspaceProject({
            'src/pages/index.zen': '<main>{cond ? (<a>Hi</a>) : null}</main>\n'
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { embeddedMarkupExpressions: true }
        });
        const pageAsset = await readBuiltPageAsset(project.outDir);

        expect(pageAsset).toMatch(/__ctx\.fragment\s*`<a>Hi<\/a>`/);
        expect(pageAsset).not.toContain('__zenith_fragment = __ctx.fragment');
        expect(pageAsset).not.toContain('const fragment = __ctx.fragment');
    });

    test('preserves shadowed callback params after component expansion', async () => {
        project = await makeWorkspaceProject({
            'src/components/ShadowPanel.zen': [
                '<script lang="ts">',
                'state count = 1;',
                'const items = [1, 2, 3];',
                '</script>',
                '<section>{items.map((count) => count + 1).join(",")}</section>'
            ].join('\n'),
            'src/pages/index.zen': '<main><ShadowPanel /></main>\n'
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const pageAsset = await readBuiltPageAsset(project.outDir);

        expect(pageAsset).toContain('.map((count) => count + 1)');
        expect(pageAsset).not.toContain('.map((signalMap.get(');
    });

    test('preserves destructuring locals after component expansion while rewriting free state structurally', async () => {
        project = await makeWorkspaceProject({
            'src/components/DestructurePanel.zen': [
                '<script lang="ts">',
                'state total = 5;',
                'const items = [{ count: 1 }, { count: 2 }];',
                '</script>',
                '<section>{items.map(({ count }) => count + total).join(",")}</section>'
            ].join('\n'),
            'src/pages/index.zen': '<main><DestructurePanel /></main>\n'
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const pageAsset = await readBuiltPageAsset(project.outDir);

        expect(pageAsset).toMatch(/\.map\(\(\{\s*count\s*\}\)\s*=>\s*count\s*\+\s*signalMap\.get\(/);
        expect(pageAsset).not.toMatch(/\(\{\s*signalMap\.get/);
    });

    test('direct local identifier bindings stay compiler-scoped after component expansion', async () => {
        project = await makeWorkspaceProject({
            'src/components/TitleBadge.zen': [
                '<script lang="ts">',
                'const resolvedTitle = typeof props.title === "string" ? props.title : "Zenith";',
                '</script>',
                '<h1>{resolvedTitle}</h1>'
            ].join('\n'),
            'src/pages/index.zen': '<main><TitleBadge title="About" /></main>\n'
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const pageAsset = await readBuiltPageAsset(project.outDir);
        const bindings = extractExpressionBindings(pageAsset);

        expect(bindings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ state_index: expect.any(Number) })
            ])
        );
        expect(pageAsset).toMatch(/"literal":"[^"]*resolvedTitle"/);
        expect(pageAsset).not.toContain('"literal":"resolvedTitle"');
        expect(pageAsset).not.toContain('return resolvedTitle;');
    });

    test('keeps distinct signal rewrites when multiple components share the same state alias', async () => {
        project = await makeWorkspaceProject({
            'src/components/FirstPanel.zen': [
                '<script lang="ts">',
                'state open = true;',
                '</script>',
                '<section>{open ? "First Open" : "First Closed"}</section>'
            ].join('\n'),
            'src/components/SecondPanel.zen': [
                '<script lang="ts">',
                'state open = false;',
                '</script>',
                '<section>{open ? "Second Open" : "Second Closed"}</section>'
            ].join('\n'),
            'src/pages/index.zen': '<main><FirstPanel /><SecondPanel /></main>\n'
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { embeddedMarkupExpressions: true }
        });
        const pageAsset = await readBuiltPageAsset(project.outDir);
        const bindings = extractExpressionBindings(pageAsset).filter((binding) =>
            /First Open|Second Open/.test(String(binding.literal || ''))
        );

        expect(bindings).toHaveLength(2);
        expect(new Set(bindings.map((binding) => binding.signal_index)).size).toBe(2);
        expect(pageAsset).not.toContain('return open ?');
    });

    test('strips temporary ZENITH_DIAG runtime logging from emitted runtime asset', async () => {
        project = await makeWorkspaceProject({
            'src/pages/index.zen': '<main><h1>Hello</h1></main>\n'
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const runtimeAsset = await readBuiltRuntimeAsset(project.outDir);

        expect(runtimeAsset).not.toContain('[ZENITH_DIAG]');
    });
});
