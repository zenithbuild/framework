import { build } from '../dist/build.js';
import { jest } from '@jest/globals';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
    evaluateBuiltModule,
    findBuiltCssAsset,
    linkWorkspaceNodeModules
} from './helpers/build-fixtures.js';

jest.setTimeout(45000);

describe('build component expansion', () => {
    let project;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
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

        expect(pageAsset).toMatch(/__ctx\.fragment\s*`/);
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

    test('rejects legacy zenhtml markup syntax', async () => {
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

        await expect(build({ pagesDir, outDir })).rejects.toThrow(/Legacy zenhtml`.*unsupported/i);
    });

    test('rewrites component embedded markup expressions with script bindings after expansion', async () => {
        const root = join(tmpdir(), `zenith-build-expr-fragment-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
                '  <ul>{items.map((item) => (<li>{item.label}</li>))}</ul>',
                '</section>'
            ].join('\n'),
            'utf8'
        );

        await writeFile(
            join(pagesDir, 'index.zen'),
            '<main><MappedList /></main>\n',
            'utf8'
        );

        await build({ pagesDir, outDir, config: { embeddedMarkupExpressions: true } });
        const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8');
        const scriptMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
        expect(scriptMatch).toBeTruthy();
        const scriptPath = String(scriptMatch?.[1] || '').replace(/^\//, '');
        const pageAsset = await readFile(join(outDir, scriptPath), 'utf8');
        expect(pageAsset.includes('items.map((item)')).toBe(true);
        expect(pageAsset).toMatch(/__ctx\.fragment\s*`<li>\$\{item\.label\}<\/li>`/);
        expect(pageAsset).toMatch(/src_components_MappedList_zen_script0_[A-Za-z0-9]+_items/);
        expect(/const\s+__zenith_state_keys\s*=\s*\[[^\]]+items/.test(pageAsset)).toBe(true);
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

        expect(pageAsset).toMatch(/return\s+signalMap\.get\(\d+\)\.get\(\)\s*===\s*['"]dark['"]\s*\?/);
        expect(pageAsset).toMatch(/Switch to light theme/);
        expect(pageAsset).toMatch(/Switch to dark theme/);
        expect(pageAsset).toMatch(/signal_indices/);
        expect(pageAsset).toMatch(/state_index/);
    });

    test('rewrites hoisted component declarations in emitted expression bindings', async () => {
        const root = join(tmpdir(), `zenith-build-hoisted-decls-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const componentsDir = join(srcDir, 'components');
        const outDir = join(root, 'dist');
        project = { root, pagesDir, outDir };

        await mkdir(pagesDir, { recursive: true });
        await mkdir(componentsDir, { recursive: true });

        await writeFile(
            join(componentsDir, 'OverlayChip.zen'),
            [
                '<script lang="ts">',
                'const overlayTone = "bg-fuchsia-500/30";',
                '</script>',
                '<div class={"base " + overlayTone}>chip</div>'
            ].join('\n'),
            'utf8'
        );

        await writeFile(
            join(pagesDir, 'index.zen'),
            '<main><OverlayChip /></main>\n',
            'utf8'
        );

        await build({ pagesDir, outDir });
        const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8');
        const scriptMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
        expect(scriptMatch).toBeTruthy();
        const scriptPath = String(scriptMatch?.[1] || '').replace(/^\//, '');
        const pageAsset = await readFile(join(outDir, scriptPath), 'utf8');

        expect(pageAsset).toMatch(/overlayTone\s*=\s*['"]bg-fuchsia-500\/30['"]/);
        expect(pageAsset).not.toMatch(/return ['"]base ['"] \+ overlayTone;/);
        expect(pageAsset).toMatch(/return\s*['"]base\s*['"]\s*\+\s*[A-Za-z0-9_$]+/);
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
});
