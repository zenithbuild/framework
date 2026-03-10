import { build } from '../dist/build.js';
import { collectExpandedComponentOccurrences } from '../src/component-occurrences.js';
import { buildComponentRegistry } from '../src/resolve-components.js';
import { jest } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

jest.setTimeout(45000);

const repoCompilerBin = fileURLToPath(
    new URL('../../compiler/target/release/zenith-compiler', import.meta.url)
);
const compilerBin = process.env.ZENITH_COMPILER_BIN || repoCompilerBin;

function escapeRegex(input) {
    return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function makeProject(files) {
    const root = join(tmpdir(), `zenith-props-prelude-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

function extractPropsObject(asset, className) {
    const pattern = new RegExp(
        String.raw`var props = \{[^}]*class:\s*['"]${escapeRegex(className)}['"][^}]*\};`
    );
    const match = asset.match(pattern);
    expect(match).toBeTruthy();
    return String(match?.[0] || '');
}

function extractScopedIdentifierFromIr(ir, rawName) {
    const declarations = Array.isArray(ir?.hoisted?.declarations) ? ir.hoisted.declarations : [];
    const pattern = new RegExp(
        String.raw`(?:const|let|var)\s+([A-Za-z0-9_]*_${escapeRegex(rawName)})\s*=`
    );
    for (const declaration of declarations) {
        if (typeof declaration !== 'string') {
            continue;
        }
        const match = declaration.match(pattern);
        if (match) {
            return String(match[1] || '');
        }
    }
    return null;
}

function runCompilerJson(filePath) {
    expect(existsSync(compilerBin)).toBe(true);
    const result = spawnSync(compilerBin, [filePath], {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024
    });
    if (result.error) {
        throw result.error;
    }
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout);
}

describe('component props prelude emission', () => {
    let project = null;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('preserves rewritten owner refs in final Heading props for direct and wrapper paths', async () => {
        project = await makeProject({
            'components/Heading.zen': [
                '<script lang="ts">',
                'export interface Props {',
                '  elementRef?: any;',
                '  class?: string;',
                '}',
                'const incoming = props as Props;',
                'const forwardedRef = incoming.elementRef;',
                'const className = typeof incoming.class === "string" ? incoming.class : "";',
                '</script>',
                '<h2 ref={forwardedRef} class={className}><slot /></h2>'
            ].join('\n'),
            'components/Wrapper.zen': [
                '<section>',
                '  <slot />',
                '</section>'
            ].join('\n'),
            'components/DirectOwner.zen': [
                '<script lang="ts">',
                'import Heading from "./Heading.zen";',
                'const headingTextRef = ref<HTMLSpanElement>();',
                '</script>',
                '<Heading elementRef={headingTextRef} class="direct-heading">Direct</Heading>'
            ].join('\n'),
            'components/WrappedOwner.zen': [
                '<script lang="ts">',
                'import Wrapper from "./Wrapper.zen";',
                'import Heading from "./Heading.zen";',
                'const headingTextRef = ref<HTMLSpanElement>();',
                '</script>',
                '<Wrapper>',
                '  <Heading elementRef={headingTextRef} class="wrapped-heading">Wrapped</Heading>',
                '</Wrapper>'
            ].join('\n'),
            'pages/index.zen': [
                '<script lang="ts">',
                'import DirectOwner from "../components/DirectOwner.zen";',
                'import WrappedOwner from "../components/WrappedOwner.zen";',
                '</script>',
                '<main>',
                '  <DirectOwner />',
                '  <WrappedOwner />',
                '</main>'
            ].join('\n')
        });

        const pagePath = join(project.pagesDir, 'index.zen');
        const source = await readFile(pagePath, 'utf8');
        const registry = buildComponentRegistry(project.srcDir);
        const occurrences = collectExpandedComponentOccurrences(source, registry, pagePath);

        const directOwnerPath = join(project.srcDir, 'components', 'DirectOwner.zen');
        const wrappedOwnerPath = join(project.srcDir, 'components', 'WrappedOwner.zen');

        const directHeading = occurrences.find(
            (entry) => entry.name === 'Heading' && String(entry.attrs || '').includes('class="direct-heading"')
        );
        const wrappedHeading = occurrences.find(
            (entry) => entry.name === 'Heading' && String(entry.attrs || '').includes('class="wrapped-heading"')
        );

        expect(directHeading?.ownerPath).toBe(directOwnerPath);
        expect(wrappedHeading?.ownerPath).toBe(wrappedOwnerPath);

        const directOwnerIr = runCompilerJson(directOwnerPath);
        const wrappedOwnerIr = runCompilerJson(wrappedOwnerPath);
        const directCompilerRef = extractScopedIdentifierFromIr(directOwnerIr, 'headingTextRef');
        const wrappedCompilerRef = extractScopedIdentifierFromIr(wrappedOwnerIr, 'headingTextRef');

        expect(directCompilerRef).toBeTruthy();
        expect(wrappedCompilerRef).toBeTruthy();
        expect(directOwnerIr.expressions).toContain(directCompilerRef);
        expect(wrappedOwnerIr.expressions).toContain(wrappedCompilerRef);
        expect(directOwnerIr.expressions).not.toContain('headingTextRef');
        expect(wrappedOwnerIr.expressions).not.toContain('headingTextRef');

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            showBundlerInfo: false,
            logger: null
        });

        const pageAsset = await readBuiltPageAsset(project.outDir);
        const directAssetRef = extractScopedIdentifier(pageAsset, 'src_components_DirectOwner_zen_script0_', 'headingTextRef');
        const wrappedAssetRef = extractScopedIdentifier(pageAsset, 'src_components_WrappedOwner_zen_script0_', 'headingTextRef');

        const directProps = extractPropsObject(pageAsset, 'direct-heading');
        const wrappedProps = extractPropsObject(pageAsset, 'wrapped-heading');

        expect(directProps).toContain(`elementRef: ${directAssetRef}`);
        expect(wrappedProps).toContain(`elementRef: ${wrappedAssetRef}`);

        expect(directProps).not.toContain('elementRef:headingTextRef');
        expect(wrappedProps).not.toContain('elementRef:headingTextRef');
        expect(pageAsset).not.toContain('elementRef: headingTextRef');
    });
});
