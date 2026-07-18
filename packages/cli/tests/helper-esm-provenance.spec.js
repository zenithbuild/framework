import { build } from '../dist/build.js';
import { jest } from '@jest/globals';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { SourceTextModule } from 'node:vm';
import { linkWorkspaceNodeModules, walkFiles } from './helpers/build-fixtures.js';

jest.setTimeout(45000);

describe('helper esm provenance and route matrix', () => {
    let project;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('retains distinct owners and record identities for identical raw import strings across different importers', async () => {
        const root = join(tmpdir(), `zenith-prov-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const docsDir = join(pagesDir, 'docs');
        const blogDir = join(pagesDir, 'blog');
        const componentsDir = join(srcDir, 'components', 'search');
        const layoutsDir = join(srcDir, 'layouts');
        const outDir = join(root, 'dist');
        project = { root, pagesDir, outDir };

        await mkdir(docsDir, { recursive: true });
        await mkdir(blogDir, { recursive: true });
        await mkdir(componentsDir, { recursive: true });
        await mkdir(layoutsDir, { recursive: true });

        // Shared helper with identical specifier "./sharedConfig.ts" when placed in adjacent dirs,
        // or let's create sharedConfig.ts inside each folder to test exact raw string './sharedConfig'
        await writeFile(join(docsDir, 'sharedConfig.ts'), 'export const TYPE = "DOCS";', 'utf8');
        await writeFile(join(componentsDir, 'sharedConfig.ts'), 'export const TYPE = "COMP";', 'utf8');
        await writeFile(join(layoutsDir, 'sharedConfig.ts'), 'export const TYPE = "LAYOUT";', 'utf8');

        // True Document Mode layout: imports "./sharedConfig" from its own directory.
        await writeFile(
            join(layoutsDir, 'DefaultLayout.zen'),
            [
                '<script lang="ts">',
                'import "./sharedConfig";',
                '</script>',
                '<html lang="en">',
                '  <body class="layout"><slot /></body>',
                '</html>'
            ].join('\n'),
            'utf8'
        );

        // Component: SearchModal.zen imports "./sharedConfig" (identical raw string as DefaultLayout!)
        await writeFile(
            join(componentsDir, 'SearchModal.zen'),
            [
                '<script lang="ts">',
                'import "./sharedConfig";',
                'const compType = "COMPONENT";',
                '</script>',
                '<div class="modal">{compType}</div>'
            ].join('\n'),
            'utf8'
        );
        await writeFile(
            join(componentsDir, 'SearchSummary.zen'),
            [
                '<script lang="ts">',
                'import "./sharedConfig";',
                'const summaryType = "SUMMARY";',
                '</script>',
                '<aside>{summaryType}</aside>'
            ].join('\n'),
            'utf8'
        );

        // Page 1: pages/docs/index.zen imports "./sharedConfig" AND renders SearchModal
        await writeFile(
            join(docsDir, 'index.zen'),
            [
                '<script lang="ts">',
                'import "./sharedConfig";',
                'import pc from "picocolors";',
                'import SearchModal from "../../components/search/SearchModal.zen";',
                'import SearchSummary from "../../components/search/SearchSummary.zen";',
                'import DefaultLayout from "../../layouts/DefaultLayout.zen";',
                'const pageType = pc.blue("DOCS");',
                '</script>',
                '<DefaultLayout>',
                '  <h1>{pageType}</h1>',
                '  <SearchModal />',
                '  <SearchSummary />',
                '</DefaultLayout>'
            ].join('\n'),
            'utf8'
        );

        // Page 2: dynamic route pages/blog/[slug].zen
        await writeFile(
            join(blogDir, '[slug].zen'),
            [
                '<script lang="ts">',
                'import SearchModal from "../../components/search/SearchModal.zen";',
                '</script>',
                '<article><SearchModal /></article>'
            ].join('\n'),
            'utf8'
        );

        await linkWorkspaceNodeModules(root);
        const result = await build({ pagesDir, outDir });

        expect(result.assets.length).toBeGreaterThan(0);
        const builtFiles = await walkFiles(outDir);

        // Verify standalone helper assets exist for each distinct importer directory
        const moduleAssets = builtFiles.filter(f => f.includes('/assets/modules/'));
        expect(moduleAssets.some(f => f.includes('.zen'))).toBe(false);
        const docsConfigAsset = moduleAssets.find(f => f.includes('pages/docs/sharedConfig'));
        const compConfigAsset = moduleAssets.find(f => f.includes('components/search/sharedConfig'));
        const layoutConfigAsset = moduleAssets.find(f => f.includes('layouts/sharedConfig'));

        expect(docsConfigAsset).toBeTruthy();
        expect(compConfigAsset).toBeTruthy();
        expect(layoutConfigAsset).toBeTruthy();

        // Check file contents to verify distinct records were NOT deduplicated by raw_source './sharedConfig' alone
        expect(await readFile(docsConfigAsset, 'utf8')).toMatch(/export const TYPE = ['"]DOCS['"]/);
        expect(await readFile(compConfigAsset, 'utf8')).toMatch(/export const TYPE = ['"]COMP['"]/);
        expect(await readFile(layoutConfigAsset, 'utf8')).toMatch(/export const TYPE = ['"]LAYOUT['"]/);
        expect(moduleAssets.filter(f => f.includes('components/search/sharedConfig'))).toHaveLength(1);

        // Check non-root page entry (pages/docs/index.js)
        const pageEntries = builtFiles.filter(f => f.includes('/assets/') && !f.includes('/modules/') && f.endsWith('.js') && !f.includes('runtime') && !f.includes('core'));
        for (const assetPath of [...pageEntries, ...moduleAssets]) {
            const source = await readFile(assetPath, 'utf8');
            expect(() => new SourceTextModule(source, { identifier: assetPath })).not.toThrow();
            expect(source).not.toMatch(/from\s+['"][^'"]+\.(?:ts|tsx)(?:[?#][^'"]*)?['"]/);
            for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
                if (match[1].startsWith('.')) {
                    await expect(access(resolve(dirname(assetPath), match[1].replace(/[?#].*$/, '')))).resolves.toBeUndefined();
                }
            }
        }
        const docsIndexEntry = pageEntries.find(f => f.includes('docs') && !f.includes('sharedConfig'));
        expect(docsIndexEntry).toBeTruthy();
        const docsIndexContent = await readFile(docsIndexEntry, 'utf8');
        expect(docsIndexContent.indexOf('import ')).toBeLessThan(docsIndexContent.indexOf('function __zenith_create_page_instance'));
        expect(docsIndexContent).not.toContain('export const TYPE');

        // Verify docsIndexEntry imports from all three distinct helper assets
        expect(docsIndexContent).toMatch(/import\s+['"].*pages\/docs\/sharedConfig.*\.js['"]/);
        expect(docsIndexContent).toMatch(/import\s+['"].*components\/search\/sharedConfig.*\.js['"]/);
        expect(docsIndexContent).toMatch(/import\s+['"].*layouts\/sharedConfig.*\.js['"]/);

        // Check dynamic route entry (pages/blog/[slug].js)
        const blogSlugEntry = pageEntries.find(f => f.includes('blog') && f.includes('slug'));
        expect(blogSlugEntry).toBeTruthy();
        const blogSlugContent = await readFile(blogSlugEntry, 'utf8');
        expect(blogSlugContent).toMatch(/import\s+['"].*components\/search\/sharedConfig.*\.js['"]/);
    });

    test('survives component compilation, cloning, nested expansion, and page merge with stable occurrence indices', async () => {
        const root = join(tmpdir(), `zenith-prov-stable-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const srcDir = join(root, 'src');
        const pagesDir = join(srcDir, 'pages');
        const componentsDir = join(srcDir, 'components');
        const outDir = join(root, 'dist');
        project = { root, pagesDir, outDir };

        await mkdir(pagesDir, { recursive: true });
        await mkdir(componentsDir, { recursive: true });

        await writeFile(join(componentsDir, 'leafHelper.ts'), 'export const VAL = 42;', 'utf8');
        await writeFile(
            join(componentsDir, 'LeafComponent.zen'),
            [
                '<script lang="ts">',
                'import { VAL } from "./leafHelper";',
                'const val = VAL;',
                '</script>',
                '<span>{val}</span>'
            ].join('\n'),
            'utf8'
        );

        // Parent component renders TWO instances of LeafComponent to trigger cloning and isolated instances
        await writeFile(
            join(componentsDir, 'ParentContainer.zen'),
            [
                '<script lang="ts">',
                'import LeafComponent from "./LeafComponent.zen";',
                '</script>',
                '<div>',
                '  <LeafComponent />',
                '  <LeafComponent />',
                '</div>'
            ].join('\n'),
            'utf8'
        );

        await writeFile(
            join(pagesDir, 'index.zen'),
            [
                '<script lang="ts">',
                'import ParentContainer from "../components/ParentContainer.zen";',
                '</script>',
                '<main><ParentContainer /></main>'
            ].join('\n'),
            'utf8'
        );

        await linkWorkspaceNodeModules(root);
        await build({ pagesDir, outDir });

        const builtFiles = await walkFiles(outDir);
        const leafAsset = builtFiles.find(f => f.includes('leafHelper'));
        expect(leafAsset).toBeTruthy();

        const pageEntries = builtFiles.filter(f => f.includes('/assets/') && !f.includes('/modules/') && f.endsWith('.js') && !f.includes('runtime') && !f.includes('core'));
        const pageContent = await readFile(pageEntries[0], 'utf8');

        // Even though LeafComponent was rendered twice and cloned/merged, leafHelper should be imported clearly
        // and without duplicate helper bodies or unresolved specifiers
        expect(pageContent).toMatch(/import\s+\{\s*VAL\s*(?:as\s+\w+)?\s*\}\s+from\s+['"].*leafHelper.*\.js['"]/);
        expect(pageContent).not.toContain('export const VAL = 42');
    });
});
