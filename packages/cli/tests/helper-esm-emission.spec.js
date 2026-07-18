import { build } from '../dist/build.js';
import { createDevBuildSession } from '../dist/dev-build-session.js';
import {
    createSourceImportRecords,
    isRelativeRuntimeHelperSpecifier,
    resolveRelativeSpecifierToFile,
    synthesizeAndResolveHelperModules
} from '../dist/build/relative-helper-modules.js';
import { jest } from '@jest/globals';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { linkWorkspaceNodeModules, walkFiles } from './helpers/build-fixtures.js';

jest.setTimeout(45000);

describe('helper esm emission and provenance', () => {
    let project;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('emits standalone helper ESM assets with importer provenance and proper export preserving', async () => {
        const root = join(tmpdir(), `zenith-helper-esm-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const componentsDir = join(srcDir, 'components', 'search');
        const outDir = join(root, 'dist');
        project = { root, pagesDir, outDir };

        await mkdir(pagesDir, { recursive: true });
        await mkdir(componentsDir, { recursive: true });

        // Helper dependency: utils.ts
        await writeFile(
            join(componentsDir, 'utils.ts'),
            [
                'export const PREFIX = "SEARCH_";',
                'const internalDefault = { max: 10 };',
                'export { internalDefault as defaultConfig };',
                'export default function formatQuery(q: string) { return PREFIX + q; }'
            ].join('\n'),
            'utf8'
        );

        // Helper module: searchEngine.ts (imports utils.ts relative to itself)
        await writeFile(
            join(componentsDir, 'searchEngine.ts'),
            [
                'import formatQuery, { PREFIX, defaultConfig as cfg } from "./utils";',
                'export const searchRecords = (query: string) => formatQuery(query) + "_" + cfg.max;'
            ].join('\n'),
            'utf8'
        );

        // Component: SearchModal.zen (imports searchEngine relative to components/search/)
        await writeFile(
            join(componentsDir, 'SearchModal.zen'),
            [
                '<script lang="ts">',
                'import { searchRecords } from "./searchEngine";',
                'const result = signal("");',
                'function runSearch() { result.set(searchRecords("test")); }',
                '</script>',
                '<div class="modal">',
                '  <button on:click={runSearch}>Search</button>',
                '  <span>{result.get()}</span>',
                '</div>'
            ].join('\n'),
            'utf8'
        );

        // Page: pages/index.zen (uses SearchModal from ../components/search/SearchModal.zen)
        await writeFile(
            join(pagesDir, 'index.zen'),
            [
                '<script lang="ts">',
                'import SearchModal from "../components/search/SearchModal.zen";',
                '</script>',
                '<main>',
                '  <SearchModal />',
                '</main>'
            ].join('\n'),
            'utf8'
        );

        await linkWorkspaceNodeModules(root);
        await build({ pagesDir, outDir });

        const builtFiles = await walkFiles(outDir);
        const moduleAssets = builtFiles.filter(f => f.includes('/assets/modules/'));

        // Assert standalone helper ESM assets were created
        expect(moduleAssets.length).toBeGreaterThanOrEqual(2);
        const searchEngineAssetPath = moduleAssets.find(f => f.includes('searchEngine'));
        const utilsAssetPath = moduleAssets.find(f => f.includes('utils'));
        expect(searchEngineAssetPath).toBeTruthy();
        expect(utilsAssetPath).toBeTruthy();

        // Check content of utils asset: preserves named, aliased, and default exports
        const utilsContent = await readFile(utilsAssetPath, 'utf8');
        expect(utilsContent).toContain('export const PREFIX');
        expect(utilsContent).toContain('export { internalDefault as defaultConfig }');
        expect(utilsContent).toContain('export default function formatQuery');

        // Check content of searchEngine asset: has rewritten top-level import to utils asset
        const searchEngineContent = await readFile(searchEngineAssetPath, 'utf8');
        expect(searchEngineContent).toMatch(/import\s+formatQuery,\s*\{\s*PREFIX,\s*defaultConfig\s+as\s+cfg\s*\}\s+from\s+['"].*utils.*\.js['"]/);
        expect(searchEngineContent).toContain('export const searchRecords');

        // Check page entry: top-level import points to searchEngine asset and body is not duplicated inside __zenith_create_page_instance
        const pageAssets = builtFiles.filter(f => f.includes('/assets/') && !f.includes('/modules/') && f.endsWith('.js') && !f.includes('runtime') && !f.includes('core'));
        expect(pageAssets.length).toBeGreaterThan(0);
        const pageContent = await readFile(pageAssets[0], 'utf8');
        expect(pageContent).toMatch(/import\s+\{\s*searchRecords\s*\}\s+from\s+['"].*searchEngine.*\.js['"]/);
        expect(pageContent).not.toContain('function formatQuery');
        expect(pageContent).not.toContain('export const searchRecords');
    });

    test('fails with explicit diagnostic naming unresolved specifier and originating importer when helper is missing', async () => {
        const root = join(tmpdir(), `zenith-helper-missing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const componentsDir = join(srcDir, 'components');
        const outDir = join(root, 'dist');
        project = { root, pagesDir, outDir };

        await mkdir(pagesDir, { recursive: true });
        await mkdir(componentsDir, { recursive: true });

        await writeFile(
            join(componentsDir, 'BrokenModal.zen'),
            [
                '<script lang="ts">',
                'import { missingFunc } from "./nonExistentHelper";',
                'const fn = missingFunc;',
                '</script>',
                '<div>{fn()}</div>'
            ].join('\n'),
            'utf8'
        );

        await writeFile(
            join(pagesDir, 'index.zen'),
            [
                '<script lang="ts">',
                'import BrokenModal from "../components/BrokenModal.zen";',
                '</script>',
                '<BrokenModal />'
            ].join('\n'),
            'utf8'
        );

        await linkWorkspaceNodeModules(root);

        let error = null;
        try {
            await build({ pagesDir, outDir });
        } catch (err) {
            error = err;
        }

        expect(error).toBeTruthy();
        const msg = String(error?.message || error);
        expect(msg).toContain('./nonExistentHelper');
        expect(msg).toContain('components/BrokenModal.js');
    });

    test('registers only supported relative runtime helpers inside srcDir', async () => {
        const root = join(tmpdir(), `zenith-helper-eligibility-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        project = { root };
        await mkdir(pagesDir, { recursive: true });

        const files = {
            'valid.ts': 'export const VALID = true;',
            'Component.zen': '<div>component</div>',
            'styles.css': '.x {}',
            'data.json': '{}',
            'unknown.bin': 'not javascript'
        };
        for (const [name, source] of Object.entries(files)) {
            await writeFile(join(pagesDir, name), source, 'utf8');
        }
        await writeFile(join(root, 'outside.ts'), 'export const OUTSIDE = true;', 'utf8');

        const imports = [
            'import { VALID } from "./valid";',
            'import Component from "./Component.zen";',
            'import "./styles.css";',
            'import data from "./data.json";',
            'import "./unknown.bin";',
            'import pc from "picocolors";'
        ];
        const pageFile = join(pagesDir, 'index.zen');
        const pageIr = {
            hoisted: { imports, code: [] },
            import_records: createSourceImportRecords(imports, pageFile, srcDir),
            modules: []
        };
        synthesizeAndResolveHelperModules(pageIr, pageFile, srcDir);

        expect(pageIr.modules.map(module => module.id)).toEqual(['pages/valid.js']);
        expect(pageIr.modules[0].source).toContain('export const VALID');
        expect(pageIr.hoisted.code).toEqual([]);
        expect(pageIr.import_records.find(record => record.specifier === './Component.zen')?.resolved_module_id).toBeNull();
        expect(resolveRelativeSpecifierToFile('../../outside.ts', pagesDir, srcDir)).toBeNull();
        for (const spec of ['./x.ts', './x.tsx', './x.js', './x.jsx', './x.mjs', './x.cjs', './x']) {
            expect(isRelativeRuntimeHelperSpecifier(spec)).toBe(true);
        }
        for (const spec of ['./x.zen', './x.css', './x.json', './x.bin', 'picocolors']) {
            expect(isRelativeRuntimeHelperSpecifier(spec)).toBe(false);
        }
    });

    test('production rebuild updates active content-hashed helper references', async () => {
        const root = join(tmpdir(), `zenith-helper-prod-rebuild-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const helperFile = join(pagesDir, 'version.ts');
        const outDir = join(root, 'dist');
        project = { root };
        await mkdir(pagesDir, { recursive: true });
        await writeFile(join(pagesDir, 'index.zen'), [
            '<script lang="ts">',
            'import { VERSION } from "./version";',
            'const version = VERSION;',
            '</script>',
            '<main>{version}</main>'
        ].join('\n'), 'utf8');
        await writeFile(helperFile, 'export const VERSION = "HELPER_VERSION_A";', 'utf8');
        await linkWorkspaceNodeModules(root);

        await build({ pagesDir, outDir });
        const filesA = await walkFiles(outDir);
        const helperA = filesA.find(file => file.includes('/assets/modules/') && file.includes('version.'));
        expect(helperA).toBeTruthy();
        const helperAName = helperA.split('/').at(-1);
        const pageSourcesA = await Promise.all(filesA.filter(file => file.endsWith('.js') && !file.includes('/modules/')).map(file => readFile(file, 'utf8')));
        expect(pageSourcesA.some(source => source.includes(helperAName))).toBe(true);

        await writeFile(helperFile, 'export const VERSION = "HELPER_VERSION_B";', 'utf8');
        await build({ pagesDir, outDir });
        const filesB = await walkFiles(outDir);
        const helperB = filesB.find(file => file.includes('/assets/modules/') && file.includes('version.'));
        expect(helperB).toBeTruthy();
        expect(helperB).not.toBe(helperA);
        expect(await readFile(helperB, 'utf8')).toContain('HELPER_VERSION_B');
        const activeText = await Promise.all(filesB.filter(file => file.endsWith('.js') || file.endsWith('.json')).map(file => readFile(file, 'utf8')));
        expect(activeText.some(source => source.includes(helperB.split('/').at(-1)))).toBe(true);
        expect(activeText.some(source => source.includes(helperAName) || source.includes('HELPER_VERSION_A'))).toBe(false);
        expect(existsSync(helperA)).toBe(false);
    });

    test('development rebuild overwrites the stable helper asset with active content', async () => {
        const root = join(tmpdir(), `zenith-helper-dev-rebuild-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const helperFile = join(pagesDir, 'version.ts');
        const outDir = join(root, 'dist');
        project = { root };
        await mkdir(pagesDir, { recursive: true });
        await writeFile(join(pagesDir, 'index.zen'), [
            '<script lang="ts">',
            'import { VERSION } from "./version";',
            'const version = VERSION;',
            '</script>',
            '<main>{version}</main>'
        ].join('\n'), 'utf8');
        await writeFile(helperFile, 'export const VERSION = "DEV_VERSION_A";', 'utf8');
        await linkWorkspaceNodeModules(root);

        const session = createDevBuildSession({ pagesDir, outDir });
        expect((await session.build({ showBundlerInfo: false })).strategy).toBe('full');
        const helperA = (await walkFiles(outDir)).find(file => file.includes('/assets/modules/') && file.includes('version.'));
        expect(helperA).toBeTruthy();
        expect(await readFile(helperA, 'utf8')).toContain('DEV_VERSION_A');

        await writeFile(helperFile, 'export const VERSION = "DEV_VERSION_B";', 'utf8');
        const rebuild = await session.build({ changedFiles: [helperFile], showBundlerInfo: false });
        expect(rebuild.strategy).toBe('full');
        const filesB = await walkFiles(outDir);
        const helperB = filesB.find(file => file.includes('/assets/modules/') && file.includes('version.'));
        expect(helperB).toBe(helperA);
        expect(await readFile(helperB, 'utf8')).toContain('DEV_VERSION_B');
        const activeText = await Promise.all(filesB.filter(file => file.endsWith('.js') || file.endsWith('.json')).map(file => readFile(file, 'utf8')));
        expect(activeText.some(source => source.includes('DEV_VERSION_A'))).toBe(false);
    });
});
