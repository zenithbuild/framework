import { build } from '../dist/build.js';
import { collectExpandedComponentOccurrences } from '../src/component-occurrences.js';
import { buildComponentRegistry } from '../src/resolve-components.js';
import { jest } from '@jest/globals';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

jest.setTimeout(45000);

function escapeRegex(input) {
    return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function makeProject(files) {
    const root = join(tmpdir(), `zenith-slot-scope-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

    return { root, srcDir, pagesDir, outDir };
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

describe('slot scope owner attribution', () => {
    let project = null;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('keeps wrapper-owned content wrapper-owned and slotted content parent-owned in traversal order', async () => {
        project = await makeProject({
            'components/BeforeThing.zen': '<div>before</div>\n',
            'components/AfterThing.zen': '<div>after</div>\n',
            'components/ChildProbe.zen': '<div>child</div>\n',
            'components/Wrapper.zen': [
                '<section>',
                '  <BeforeThing />',
                '  <slot />',
                '  <AfterThing />',
                '</section>'
            ].join('\n'),
            'pages/index.zen': [
                '<script lang="ts">',
                'import Wrapper from "../components/Wrapper.zen";',
                'import ChildProbe from "../components/ChildProbe.zen";',
                '</script>',
                '<Wrapper>',
                '  <ChildProbe />',
                '</Wrapper>'
            ].join('\n')
        });

        const pagePath = join(project.pagesDir, 'index.zen');
        const source = await readFile(pagePath, 'utf8');
        const registry = buildComponentRegistry(project.srcDir);
        const occurrences = collectExpandedComponentOccurrences(source, registry, pagePath);
        const wrapperPath = join(project.srcDir, 'components', 'Wrapper.zen');

        expect(occurrences.map((entry) => ({
            name: entry.name,
            ownerPath: entry.ownerPath,
            componentPath: entry.componentPath
        }))).toEqual([
            {
                name: 'Wrapper',
                ownerPath: pagePath,
                componentPath: wrapperPath
            },
            {
                name: 'BeforeThing',
                ownerPath: wrapperPath,
                componentPath: join(project.srcDir, 'components', 'BeforeThing.zen')
            },
            {
                name: 'ChildProbe',
                ownerPath: pagePath,
                componentPath: join(project.srcDir, 'components', 'ChildProbe.zen')
            },
            {
                name: 'AfterThing',
                ownerPath: wrapperPath,
                componentPath: join(project.srcDir, 'components', 'AfterThing.zen')
            }
        ]);
    });

    test('rewrites slotted ref, state, and signal attrs against parent scope inside child props object', async () => {
        project = await makeProject({
            'components/BeforeThing.zen': '<div>before</div>\n',
            'components/AfterThing.zen': '<div>after</div>\n',
            'components/Wrapper.zen': [
                '<script lang="ts">',
                'const headingTextRef = ref<HTMLDivElement>();',
                'state viewMode = "wrapper-mode";',
                'const valueSignal = signal("wrapper-signal");',
                '</script>',
                '<section>',
                '  <BeforeThing />',
                '  <slot />',
                '  <AfterThing />',
                '</section>'
            ].join('\n'),
            'components/ChildProbe.zen': [
                '<script lang="ts">',
                'export interface Props {',
                '  slotRef?: any;',
                '  slotMode?: string;',
                '  slotSignal?: string;',
                '}',
                'const incoming = props as Props;',
                'const textRef = incoming.slotRef;',
                'const slotMode = incoming.slotMode || "";',
                'const slotSignal = incoming.slotSignal || "";',
                '</script>',
                '<div ref={textRef} data-slot-mode={slotMode} data-slot-signal={slotSignal}>child</div>'
            ].join('\n'),
            'pages/index.zen': [
                '<script lang="ts">',
                'import Wrapper from "../components/Wrapper.zen";',
                'import ChildProbe from "../components/ChildProbe.zen";',
                'const headingTextRef = ref<HTMLSpanElement>();',
                'state viewMode = "parent-mode";',
                'const valueSignal = signal("parent-signal");',
                '</script>',
                '<Wrapper>',
                '  <ChildProbe slotRef={headingTextRef} slotMode={viewMode} slotSignal={valueSignal.get()} />',
                '</Wrapper>'
            ].join('\n')
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            showBundlerInfo: false,
            logger: null
        });

        const pageAsset = await readBuiltPageAsset(project.outDir);
        const propsMatch = pageAsset.match(/var props = \{[^}]*slotRef:[^}]*slotMode:[^}]*slotSignal:[^}]*\};/);
        expect(propsMatch).toBeTruthy();
        const propsObject = String(propsMatch?.[0] || '');

        const parentRef = extractScopedIdentifier(pageAsset, 'src_pages_index_zen_script0_', 'headingTextRef');
        const parentState = extractScopedIdentifier(pageAsset, 'src_pages_index_zen_script0_', 'viewMode');
        const parentSignal = extractScopedIdentifier(pageAsset, 'src_pages_index_zen_script0_', 'valueSignal');
        const wrapperRef = extractScopedIdentifier(pageAsset, 'src_components_Wrapper_zen_script0_', 'headingTextRef');
        const wrapperState = extractScopedIdentifier(pageAsset, 'src_components_Wrapper_zen_script0_', 'viewMode');
        const wrapperSignal = extractScopedIdentifier(pageAsset, 'src_components_Wrapper_zen_script0_', 'valueSignal');

        expect(propsObject).toContain(`slotRef: ${parentRef}`);
        expect(propsObject).toContain(`slotMode: ${parentState}`);
        expect(propsObject).toContain(`slotSignal: ${parentSignal}.get()`);

        expect(propsObject).not.toContain('slotRef: headingTextRef');
        expect(propsObject).not.toContain('slotMode: viewMode');
        expect(propsObject).not.toContain('slotSignal: valueSignal.get()');

        expect(propsObject).not.toContain(`slotRef: ${wrapperRef}`);
        expect(propsObject).not.toContain(`slotMode: ${wrapperState}`);
        expect(propsObject).not.toContain(`slotSignal: ${wrapperSignal}.get()`);
    });
});
