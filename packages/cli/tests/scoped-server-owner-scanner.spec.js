import { buildComponentRegistry } from '../src/resolve-components.js';
import {
    SCOPED_SERVER_DIAGNOSTIC,
    scanRouteScopedServerOwners
} from '../dist/scoped-server-data/owner-scanner.js';
import { jest } from '@jest/globals';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

jest.setTimeout(30000);

/**
 * @param {Record<string, string>} files
 */
async function makeProject(files) {
    const root = join(tmpdir(), `zenith-csv-scanner-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const srcDir = join(root, 'src');
    const pagesDir = join(srcDir, 'pages');
    await mkdir(pagesDir, { recursive: true });
    await mkdir(join(srcDir, 'layouts'), { recursive: true });
    await mkdir(join(srcDir, 'components'), { recursive: true });

    for (const [file, source] of Object.entries(files)) {
        const fullPath = join(srcDir, file);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, source, 'utf8');
    }

    return { root, srcDir, pagesDir };
}

function scanPage(project, pageRelPath, pageSource) {
    const registry = buildComponentRegistry(project.srcDir);
    const pageFile = join(project.srcDir, pageRelPath);
    return scanRouteScopedServerOwners({
        pageSource,
        pageFile,
        registry,
        srcDir: project.srcDir
    });
}

describe('scoped server owner scanner (#96)', () => {
    /** @type {{ root: string, srcDir: string, pagesDir: string } | null} */
    let project = null;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('detects layout Level 1 const and serialization set', async () => {
        project = await makeProject({
            'layouts/DefaultLayout.zen': [
                '<script server lang="ts">',
                'const raw = await getNavigation()',
                'const navigation = normalizeNav(raw)',
                '</script>',
                '<Navigation content={navigation} />'
            ].join('\n'),
            'components/Navigation.zen': '<nav>{content?.title}</nav>\n',
            'pages/index.zen': [
                '<script lang="ts">',
                'import DefaultLayout from "../layouts/DefaultLayout.zen";',
                '</script>',
                '<DefaultLayout />'
            ].join('\n')
        });

        const pageSource = [
            '<script lang="ts">',
            'import DefaultLayout from "../layouts/DefaultLayout.zen";',
            '</script>',
            '<DefaultLayout />'
        ].join('\n');
        const result = scanPage(project, 'pages/index.zen', pageSource);

        expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
        expect(result.owners).toHaveLength(1);
        expect(result.owners[0]).toMatchObject({
            ownerKind: 'layout',
            syntax: 'variables',
            serializedVariableNames: ['navigation'],
            level1VariableNames: ['raw', 'navigation']
        });
        expect(result.owners[0].ownerKey).toContain('layouts/DefaultLayout.zen');
    });

    test('detects explicit scoped data export', async () => {
        project = await makeProject({
            'components/StatsCard.zen': [
                '<script server lang="ts">',
                'export const data = async (ctx, props) => ({',
                '  stats: await getRepoStats(ctx, props.repoId)',
                '})',
                '</script>',
                '<p>{data.stats.stars}</p>'
            ].join('\n'),
            'pages/index.zen': [
                '<script lang="ts">',
                'import StatsCard from "../components/StatsCard.zen";',
                '</script>',
                '<StatsCard repoId="abc" />'
            ].join('\n')
        });

        const pageSource = [
            '<script lang="ts">',
            'import StatsCard from "../components/StatsCard.zen";',
            '</script>',
            '<StatsCard repoId="abc" />'
        ].join('\n');
        const result = scanPage(project, 'pages/index.zen', pageSource);

        expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
        expect(result.owners[0]).toMatchObject({
            ownerKind: 'component',
            syntax: 'explicit-data',
            exportName: 'data',
            serializedVariableNames: ['stats']
        });
    });

    test('emits CSV001 for layout load misuse', async () => {
        project = await makeProject({
            'layouts/DefaultLayout.zen': [
                '<script server lang="ts">',
                'export const load = async (ctx) => ({ navigation: await getNavigation() })',
                '</script>',
                '<slot />'
            ].join('\n'),
            'pages/index.zen': [
                '<script lang="ts">',
                'import DefaultLayout from "../layouts/DefaultLayout.zen";',
                '</script>',
                '<DefaultLayout />'
            ].join('\n')
        });

        const pageSource = [
            '<script lang="ts">',
            'import DefaultLayout from "../layouts/DefaultLayout.zen";',
            '</script>',
            '<DefaultLayout />'
        ].join('\n');
        const result = scanPage(project, 'pages/index.zen', pageSource);

        expect(result.owners).toEqual([]);
        expect(result.diagnostics.some((item) => item.code === SCOPED_SERVER_DIAGNOSTIC.OWNER_LOAD_MISUSE)).toBe(true);
    });

    test('emits CSV002 and CSV003 for guard/action misuse', async () => {
        project = await makeProject({
            'components/Panel.zen': [
                '<script server lang="ts">',
                'export const guard = async (ctx) => ctx.allow()',
                'export const action = async (ctx) => ctx.data({ ok: true })',
                '</script>',
                '<div />'
            ].join('\n'),
            'pages/index.zen': [
                '<script lang="ts">',
                'import Panel from "../components/Panel.zen";',
                '</script>',
                '<Panel />'
            ].join('\n')
        });

        const pageSource = [
            '<script lang="ts">',
            'import Panel from "../components/Panel.zen";',
            '</script>',
            '<Panel />'
        ].join('\n');
        const result = scanPage(project, 'pages/index.zen', pageSource);

        expect(result.diagnostics.some((item) => item.code === SCOPED_SERVER_DIAGNOSTIC.OWNER_GUARD_MISUSE)).toBe(true);
        expect(result.diagnostics.some((item) => item.code === SCOPED_SERVER_DIAGNOSTIC.OWNER_ACTION_MISUSE)).toBe(true);
    });

    test('rejects reserved binding names and let', async () => {
        project = await makeProject({
            'components/Bad.zen': [
                '<script server lang="ts">',
                'let navigation = await getNavigation()',
                'const data = await getSomething()',
                '</script>',
                '<div>{navigation}</div>'
            ].join('\n'),
            'pages/index.zen': [
                '<script lang="ts">',
                'import Bad from "../components/Bad.zen";',
                '</script>',
                '<Bad />'
            ].join('\n')
        });

        const pageSource = [
            '<script lang="ts">',
            'import Bad from "../components/Bad.zen";',
            '</script>',
            '<Bad />'
        ].join('\n');
        const result = scanPage(project, 'pages/index.zen', pageSource);

        expect(result.diagnostics.some((item) => item.code === SCOPED_SERVER_DIAGNOSTIC.LEVEL1_LET_REJECTED)).toBe(true);
        expect(result.diagnostics.some((item) => item.code === SCOPED_SERVER_DIAGNOSTIC.RESERVED_BINDING)).toBe(true);
    });

    test('rejects multiple script server blocks', async () => {
        project = await makeProject({
            'components/Dup.zen': [
                '<script server lang="ts">const a = 1</script>',
                '<script server lang="ts">const b = 2</script>',
                '<div>{a}</div>'
            ].join('\n'),
            'pages/index.zen': [
                '<script lang="ts">',
                'import Dup from "../components/Dup.zen";',
                '</script>',
                '<Dup />'
            ].join('\n')
        });

        const pageSource = [
            '<script lang="ts">',
            'import Dup from "../components/Dup.zen";',
            '</script>',
            '<Dup />'
        ].join('\n');
        const result = scanPage(project, 'pages/index.zen', pageSource);

        expect(result.diagnostics.some((item) => item.code === SCOPED_SERVER_DIAGNOSTIC.MULTIPLE_SERVER_BLOCKS)).toBe(true);
    });

    test('detects client script leak', async () => {
        project = await makeProject({
            'components/Leak.zen': [
                '<script server lang="ts">',
                'const secret = await getSecret()',
                '</script>',
                '<script setup>',
                'console.log(secret)',
                '</script>',
                '<div />'
            ].join('\n'),
            'pages/index.zen': [
                '<script lang="ts">',
                'import Leak from "../components/Leak.zen";',
                '</script>',
                '<Leak />'
            ].join('\n')
        });

        const pageSource = [
            '<script lang="ts">',
            'import Leak from "../components/Leak.zen";',
            '</script>',
            '<Leak />'
        ].join('\n');
        const result = scanPage(project, 'pages/index.zen', pageSource);

        expect(result.diagnostics.some((item) => item.code === SCOPED_SERVER_DIAGNOSTIC.CLIENT_SCRIPT_LEAK)).toBe(true);
    });

    test('does not scan unused owners', async () => {
        project = await makeProject({
            'layouts/UnusedLayout.zen': [
                '<script server lang="ts">',
                'const navigation = await getNavigation()',
                '</script>',
                '<div />'
            ].join('\n'),
            'pages/index.zen': '<main>plain page</main>\n'
        });

        const result = scanPage(project, 'pages/index.zen', '<main>plain page</main>\n');
        expect(result.owners).toEqual([]);
    });

    test('emits CSV008 for competing document roots', async () => {
        project = await makeProject({
            'layouts/DocLayout.zen': [
                '<!DOCTYPE html>',
                '<html><body><slot /></body></html>'
            ].join('\n'),
            'pages/index.zen': [
                '<script lang="ts">',
                'import DocLayout from "../layouts/DocLayout.zen";',
                '</script>',
                '<!DOCTYPE html>',
                '<html><body>',
                '  <DocLayout />',
                '</body></html>'
            ].join('\n')
        });

        const pageSource = [
            '<script lang="ts">',
            'import DocLayout from "../layouts/DocLayout.zen";',
            '</script>',
            '<!DOCTYPE html>',
            '<html><body>',
            '  <DocLayout />',
            '</body></html>'
        ].join('\n');
        const result = scanPage(project, 'pages/index.zen', pageSource);

        expect(result.diagnostics.some((item) => item.code === SCOPED_SERVER_DIAGNOSTIC.COMPETING_DOCUMENT_ROOTS)).toBe(true);
    });
});
