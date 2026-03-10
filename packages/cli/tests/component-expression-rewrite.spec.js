import { build } from '../dist/build.js';
import { jest } from '@jest/globals';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

jest.setTimeout(45000);

function escapeRegex(input) {
    return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function makeProject(files) {
    const root = join(tmpdir(), `zenith-component-expression-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const srcDir = join(root, 'src');
    const pagesDir = join(srcDir, 'pages');
    const outDir = join(root, 'dist');

    await mkdir(srcDir, { recursive: true });
    await mkdir(pagesDir, { recursive: true });

    for (const [file, source] of Object.entries(files)) {
        const fullPath = join(srcDir, file);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, source, 'utf8');
    }

    return { root, pagesDir, outDir };
}

async function readBuiltPageAsset(outDir) {
    const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8');
    const scriptMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
    expect(scriptMatch).toBeTruthy();
    const scriptPath = String(scriptMatch?.[1] || '').replace(/^\//, '');
    return readFile(join(outDir, scriptPath), 'utf8');
}

function extractScopedIdentifier(asset, scopeFragment, rawName) {
    const pattern = new RegExp(
        String.raw`(?:const|var|let)\s+([A-Za-z0-9_]*${escapeRegex(scopeFragment)}[A-Za-z0-9_]*_${escapeRegex(rawName)})\s*=`
    );
    const match = asset.match(pattern);
    expect(match).toBeTruthy();
    return String(match?.[1] || '');
}

describe('component expression rewrite preservation', () => {
    let project = null;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('preserves rewritten local const symbols in final built binding functions for imported components', async () => {
        project = await makeProject({
            'components/MiniChooser.zen': [
                '<script lang="ts">',
                'const activeClass = "on";',
                'const inactiveClass = "off";',
                'state selected = "core";',
                'function choose(next: string) {',
                '  selected = next;',
                '}',
                '</script>',
                '<div>',
                '  <button class={selected === "core" ? activeClass : inactiveClass} on:click={() => choose("core")}>core</button>',
                '  <button class={selected === "lang" ? activeClass : inactiveClass} on:click={() => choose("lang")}>lang</button>',
                '</div>'
            ].join('\n'),
            'pages/index.zen': [
                '<script lang="ts">',
                'import MiniChooser from "../components/MiniChooser.zen";',
                '</script>',
                '<main>',
                '  <MiniChooser />',
                '</main>'
            ].join('\n')
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            showBundlerInfo: false,
            logger: null
        });

        const pageAsset = await readBuiltPageAsset(project.outDir);
        const activeClass = extractScopedIdentifier(pageAsset, 'src_components_MiniChooser_zen_script0_', 'activeClass');
        const inactiveClass = extractScopedIdentifier(pageAsset, 'src_components_MiniChooser_zen_script0_', 'inactiveClass');

        const fnMatch = pageAsset.match(
            /function\(__ctx\)\s*\{[^}]*return signalMap\.get\(\d+\)\.get\(\) === "core" \? ([^:;]+) : ([^;]+); \}/
        );
        expect(fnMatch).toBeTruthy();
        const fnBody = String(fnMatch?.[0] || '');

        expect(fnBody).toContain(`? ${activeClass} : ${inactiveClass};`);
        expect(fnBody).not.toContain('? activeClass : inactiveClass;');
        expect(fnBody).not.toContain(`? ${activeClass.replace(/\\/g, '\\\\')} : inactiveClass;`);
        expect(fnBody).not.toContain('? activeClass :');
        expect(fnBody).not.toContain(': inactiveClass;');
    });
});
