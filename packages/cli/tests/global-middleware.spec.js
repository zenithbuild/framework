import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cli } from '../dist/index.js';
import {
    assertGlobalMiddlewareTargetSupported,
    resolveGlobalMiddleware,
    validateGlobalMiddlewareSource
} from '../src/global-middleware.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

const VALID_MIDDLEWARE = [
    'export default async function middleware(ctx, next) {',
    '  return next();',
    '}',
    ''
].join('\n');

async function createProject(files = {}) {
    const root = join(tmpdir(), `zenith-global-middleware-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

function expectSourceOnlyMetadata(manifest, sourceFile) {
    expect(manifest.global_middleware).toEqual({ source_file: sourceFile });
    for (const forbidden of [
        'module',
        'stub',
        'entry',
        'root',
        'middleware_root',
        'compiled_path',
        'emitted_module_path'
    ]) {
        expect(manifest.global_middleware).not.toHaveProperty(forbidden);
    }
}

describe('global middleware Gate 1', () => {
    let projectRoot = null;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
            projectRoot = null;
        }
    });

    describe('discovery', () => {
        test('pagesDir "src/pages" discovers src/middleware.ts', async () => {
            projectRoot = await createProject({
                'src/pages/index.zen': '<main>home</main>\n',
                'src/middleware.ts': VALID_MIDDLEWARE
            });

            const middleware = await resolveGlobalMiddleware({
                projectRoot,
                pagesDir: 'src/pages',
                target: 'node'
            });

            expect(middleware.sourceFile).toBe('src/middleware.ts');
            expect(middleware.metadata).toEqual({ source_file: 'src/middleware.ts' });
        });

        test('pagesDir "pages" discovers middleware.ts', async () => {
            projectRoot = await createProject({
                'pages/index.zen': '<main>home</main>\n',
                'middleware.ts': VALID_MIDDLEWARE
            });

            const middleware = await resolveGlobalMiddleware({
                projectRoot,
                pagesDir: 'pages',
                target: 'node'
            });

            expect(middleware.sourceFile).toBe('middleware.ts');
            expect(middleware.metadata).toEqual({ source_file: 'middleware.ts' });
        });

        test('middleware/index.ts is supported', async () => {
            projectRoot = await createProject({
                'pages/index.zen': '<main>home</main>\n',
                'middleware/index.ts': VALID_MIDDLEWARE
            });

            const middleware = await resolveGlobalMiddleware({
                projectRoot,
                pagesDir: 'pages',
                target: 'node'
            });

            expect(middleware.sourceFile).toBe('middleware/index.ts');
        });

        test('wrong path src/lib/middleware.ts is ignored', async () => {
            projectRoot = await createProject({
                'src/pages/index.zen': '<main>home</main>\n',
                'src/lib/middleware.ts': VALID_MIDDLEWARE
            });

            await expect(resolveGlobalMiddleware({
                projectRoot,
                pagesDir: 'src/pages',
                target: 'node'
            })).resolves.toBeNull();
        });

        test('root .js middleware is ignored', async () => {
            projectRoot = await createProject({
                'pages/index.zen': '<main>home</main>\n',
                'middleware.js': 'module.exports = () => null;\n',
                'middleware/index.js': 'module.exports = () => null;\n'
            });

            await expect(resolveGlobalMiddleware({
                projectRoot,
                pagesDir: 'pages',
                target: 'node'
            })).resolves.toBeNull();
        });

        test('nested .js middleware is ignored', async () => {
            projectRoot = await createProject({
                'pages/index.zen': '<main>home</main>\n',
                'pages/admin/middleware.js': 'module.exports = () => null;\n',
                'pages/admin/middleware/index.js': 'module.exports = () => null;\n'
            });

            await expect(resolveGlobalMiddleware({
                projectRoot,
                pagesDir: 'pages',
                target: 'node'
            })).resolves.toBeNull();
        });
    });

    describe('duplicates and nested files', () => {
        test('middleware.ts plus middleware/index.ts rejects', async () => {
            projectRoot = await createProject({
                'pages/index.zen': '<main>home</main>\n',
                'middleware.ts': VALID_MIDDLEWARE,
                'middleware/index.ts': VALID_MIDDLEWARE
            });

            await expect(resolveGlobalMiddleware({
                projectRoot,
                pagesDir: 'pages',
                target: 'node'
            })).rejects.toThrow(
                'Multiple global middleware files found'
            );
        });

        test('pages/admin/middleware.ts rejects', async () => {
            projectRoot = await createProject({
                'pages/index.zen': '<main>home</main>\n',
                'pages/admin/middleware.ts': VALID_MIDDLEWARE
            });

            await expect(resolveGlobalMiddleware({
                projectRoot,
                pagesDir: 'pages',
                target: 'node'
            })).rejects.toThrow(
                'Nested middleware files are not supported in V1'
            );
        });

        test('pages/admin/middleware/index.ts rejects', async () => {
            projectRoot = await createProject({
                'pages/index.zen': '<main>home</main>\n',
                'pages/admin/middleware/index.ts': VALID_MIDDLEWARE
            });

            await expect(resolveGlobalMiddleware({
                projectRoot,
                pagesDir: 'pages',
                target: 'node'
            })).rejects.toThrow(
                'Nested middleware files are not supported in V1'
            );
        });
    });

    describe('export validation', () => {
        function validate(source) {
            validateGlobalMiddlewareSource(source, 'middleware.ts', projectRoot || process.cwd());
        }

        test('valid default function with two params passes', () => {
            validate([
                'export default function middleware(ctx, next) {',
                '  return next();',
                '}'
            ].join('\n'));
        });

        test('valid default arrow with two params passes', () => {
            validate([
                'export default async (ctx, next) => {',
                '  return next();',
                '};'
            ].join('\n'));
        });

        test.each([
            ['zero params', 'export default function middleware() {}'],
            ['one param', 'export default function middleware(ctx) {}'],
            ['three params', 'export default function middleware(ctx, next, extra) {}'],
            ['rest param', 'export default function middleware(ctx, ...next) {}']
        ])('%s rejects', (_label, source) => {
            expect(() => validate(source)).toThrow(
                'default function must accept exactly two arguments: ctx and next.'
            );
        });

        test.each([
            ['default object', 'export default {};'],
            ['default array', 'export default [];'],
            ['default identifier', 'const middleware = (ctx, next) => next();\nexport default middleware;'],
            ['default call expression', 'function createMiddleware() {}\nexport default createMiddleware();']
        ])('%s rejects', (_label, source) => {
            expect(() => validate(source)).toThrow(
                'default export must be a function. Use `export default function middleware(ctx, next) { ... }`.'
            );
        });

        test('CommonJS rejects', () => {
            expect(() => validate('module.exports = function middleware(ctx, next) {};')).toThrow(
                'CommonJS middleware exports are not supported'
            );
        });

        test('runtime named export rejects', () => {
            expect(() => validate([
                'export function helper() {}',
                'export default function middleware(ctx, next) { return next(); }'
            ].join('\n'))).toThrow(
                'named runtime exports are not supported'
            );
        });

        test('TypeScript type-only exports pass', () => {
            expect(() => validate([
                'export interface Foo { value: string }',
                'export type Bar = Foo;',
                'type Local = { ok: boolean };',
                'export type { Local };',
                'export default function middleware(ctx, next) { return next(); }'
            ].join('\n'))).not.toThrow();
        });
    });

    describe('target rejection', () => {
        test.each(['static', 'static-export', 'vercel-static', 'netlify-static'])(
            '%s rejects global middleware',
            async (target) => {
                projectRoot = await createProject({
                    'pages/index.zen': '<main>home</main>\n',
                    'middleware.ts': VALID_MIDDLEWARE
                });

                await expect(resolveGlobalMiddleware({
                    projectRoot,
                    pagesDir: 'pages',
                    target
                })).rejects.toThrow(`target "${target}" cannot use global middleware`);
            }
        );

        test('middleware target validation does not reject legacy or custom adapter names', () => {
            const middleware = { sourceFile: 'middleware.ts' };
            expect(() => assertGlobalMiddlewareTargetSupported('legacy', middleware)).not.toThrow();
            expect(() => assertGlobalMiddlewareTargetSupported('custom-adapter', middleware)).not.toThrow();
        });
    });

    describe('manifest metadata', () => {
        test('node build writes source-only metadata to existing build and server manifests', async () => {
            projectRoot = await createProject({
                'src/pages/index.zen': '<main>home</main>\n',
                'src/middleware.ts': VALID_MIDDLEWARE,
                'zenith.config.js': 'module.exports = { target: "node" };\n'
            });

            await cli(['build'], projectRoot);

            const coreManifest = await readJson(join(projectRoot, '.zenith-output', 'manifest.json'));
            const coreServerManifest = await readJson(join(projectRoot, '.zenith-output', 'server', 'manifest.json'));
            const distManifest = await readJson(join(projectRoot, 'dist', 'manifest.json'));
            const distServerManifest = await readJson(join(projectRoot, 'dist', 'server', 'manifest.json'));

            for (const manifest of [coreManifest, coreServerManifest, distManifest, distServerManifest]) {
                expectSourceOnlyMetadata(manifest, 'src/middleware.ts');
            }

            expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'global-middleware', 'entry.js'))).toBe(false);
            expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'middleware.js'))).toBe(false);
            expect(existsSync(join(projectRoot, 'dist', 'server', 'global-middleware', 'entry.js'))).toBe(false);
            expect(existsSync(join(projectRoot, 'dist', 'server', 'middleware.js'))).toBe(false);
        });

        test('global_middleware is omitted when middleware is absent', async () => {
            projectRoot = await createProject({
                'pages/index.zen': '<main>home</main>\n',
                'zenith.config.js': 'module.exports = { target: "node" };\n'
            });

            await cli(['build'], projectRoot);

            const coreManifest = await readJson(join(projectRoot, '.zenith-output', 'manifest.json'));
            const coreServerManifest = await readJson(join(projectRoot, '.zenith-output', 'server', 'manifest.json'));
            const distManifest = await readJson(join(projectRoot, 'dist', 'manifest.json'));
            const distServerManifest = await readJson(join(projectRoot, 'dist', 'server', 'manifest.json'));

            for (const manifest of [coreManifest, coreServerManifest, distManifest, distServerManifest]) {
                expect(manifest).not.toHaveProperty('global_middleware');
            }
        });
    });

    describe('CLI static targets', () => {
        test.each(['static', 'static-export', 'vercel-static', 'netlify-static'])(
            'build rejects %s when global middleware is present',
            async (target) => {
                projectRoot = await createProject({
                    'pages/index.zen': '<main>home</main>\n',
                    'middleware.ts': VALID_MIDDLEWARE,
                    'zenith.config.js': `module.exports = { target: ${JSON.stringify(target)} };\n`
                });

                await expect(cli(['build'], projectRoot)).rejects.toThrow(
                    `[Zenith:Middleware] target "${target}" cannot use global middleware`
                );
            }
        );
    });
});
