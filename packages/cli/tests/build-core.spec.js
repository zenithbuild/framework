import { build } from '../dist/build.js';
import { generateEnvDts } from '../dist/types/generate-env-dts.js';
import { jest } from '@jest/globals';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeProject, walkFiles } from './helpers/build-fixtures.js';

jest.setTimeout(45000);

describe('build orchestration core', () => {
    let project;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('spawns compiler and bundler processes to emit route output', async () => {
        project = await makeProject({
            'index.zen': '<script lang="ts">const title = "Home";</script><main><h1>{title}</h1></main>\n',
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
        expect(indexHtml).toMatch(/<h1\b/);
        expect(indexHtml).toContain('</h1>');
    });

    test('build output remains stable for identical input', async () => {
        project = await makeProject({
            'index.zen': '<script lang="ts">const count = 1;</script><main><p>{count}</p></main>\n',
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
        expect(envDts).toContain('headers: Record<string, string>;');
        expect(envDts).toContain('cookies: Record<string, string>;');
        expect(envDts).toContain('method: string;');
        expect(envDts).toContain('env: Record<string, unknown>;');
        expect(envDts).toContain('action: ActionState;');
        expect(envDts).toContain('auth: {');
        expect(envDts).toContain('data<T extends PageData = PageData>(payload: T): DataResult<T>;');
        expect(envDts).toContain('redirect(location: string, status?: number): RedirectResult;');
        expect(envDts).toContain('deny(status: 401 | 403 | 404, message?: string): DenyResult;');
        expect(envDts).toContain('bodyEncoding: "utf8" | "base64";');
        expect(envDts).toContain('type PageRouteResult<T extends PageData = PageData> = T | DataResult<T> | RedirectResult | DenyResult;');
        expect(envDts).not.toContain('stream(');
        expect(envDts).not.toContain('sse(');
        expect(routeDts.includes('"/": {}')).toBe(true);
        expect(Array.isArray(tsconfig.include)).toBe(true);
        expect(tsconfig.include.includes('.zenith/**/*.d.ts')).toBe(true);
    });

    test('direct env type generation uses the shared LoadContext contract', async () => {
        project = await makeProject({
            'index.zen': '<main>Types</main>\n'
        });

        await generateEnvDts(project.root);

        const envDts = await readFile(join(project.root, '.zenith', 'zenith-env.d.ts'), 'utf8');
        expect(envDts).toContain('interface LoadContext');
        expect(envDts).toContain('headers: Record<string, string>;');
        expect(envDts).toContain('auth: {');
        expect(envDts).toContain('type Load<T extends PageData = PageData> = (ctx: LoadContext) => Promise<PageRouteResult<T>> | PageRouteResult<T>;');
        expect(envDts).not.toContain('stream(');
        expect(envDts).not.toContain('sse(');
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

    test('rejects duplicate inline and adjacent load definitions', async () => {
        project = await makeProject({
            'index.zen': [
                '<script server lang="ts">',
                'export const load = async (ctx) => ({ ok: true });',
                '</script>',
                '<main>bad</main>'
            ].join('\n'),
            'index.load.ts': 'export const load = async (ctx) => ({ ok: true });'
        });

        await expect(build({ pagesDir: project.pagesDir, outDir: project.outDir })).rejects.toThrow(
            'load is defined both inline and in an adjacent module'
        );
    });

    test('rejects adjacent load combined with inline data export', async () => {
        project = await makeProject({
            'index.zen': [
                '<script server lang="ts">',
                'export const data = { ok: true };',
                '</script>',
                '<main>bad</main>'
            ].join('\n'),
            'index.load.ts': 'export const load = async (ctx) => ({ ok: true });'
        });

        await expect(build({ pagesDir: project.pagesDir, outDir: project.outDir })).rejects.toThrow(
            'adjacent load module cannot be combined with inline data/legacy payload exports'
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
            'index.zen': '<script lang="ts">const cond = true;</script><main>{cond ? (<a>Hi</a>) : null}</main>\n'
        });

        const result = await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { embeddedMarkupExpressions: true }
        });

        expect(result.pages).toBe(1);
        expect((await readFile(join(project.outDir, 'index.html'), 'utf8')).includes('<!DOCTYPE html>')).toBe(true);
    });
});
