
import { readdirSync, readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, dirname, basename, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { build } from '../src/build.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const INTERNAL_PACKAGE_NAMES = [
    '@zenithbuild/core',
    '@zenithbuild/cli',
    '@zenithbuild/compiler',
    '@zenithbuild/runtime',
    '@zenithbuild/router',
    '@zenithbuild/bundler'
];
const INTERNAL_DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const TRAIN_MANIFESTS = [
    'zenith-core/package.json',
    'zenith-cli/package.json',
    'zenith-compiler/package.json',
    'zenith-runtime/package.json',
    'zenith-router/package.json',
    'zenith-bundler/package.json',
    'zenith-site-v0/package.json',
    'create-zenith/examples/starter/package.json',
    'create-zenith/examples/starter-tailwindcss/package.json'
];

function collectFiles(dir, allowExt) {
    const out = [];
    const stack = [dir];
    while (stack.length > 0) {
        const current = stack.pop();
        let entries = [];
        try {
            entries = readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'target') {
                continue;
            }
            const full = join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (allowExt.some((ext) => entry.name.endsWith(ext))) {
                out.push(full);
            }
        }
    }
    return out;
}

function scanFiles(files, matcher) {
    const hits = [];
    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        if (matcher.test(source)) {
            hits.push(file);
        }
        matcher.lastIndex = 0;
    }
    return hits;
}

function collectInternalPackageVersions(tree, outMap = new Map()) {
    if (!tree || typeof tree !== 'object') {
        return outMap;
    }

    const dependencies = tree.dependencies && typeof tree.dependencies === 'object'
        ? tree.dependencies
        : {};

    for (const [name, dep] of Object.entries(dependencies)) {
        if (INTERNAL_PACKAGE_NAMES.includes(name)) {
            const version = dep && typeof dep === 'object' ? dep.version : undefined;
            if (typeof version === 'string' && version.length > 0) {
                if (!outMap.has(name)) {
                    outMap.set(name, new Set());
                }
                outMap.get(name).add(version);
            }
        }
        collectInternalPackageVersions(dep, outMap);
    }

    return outMap;
}

describe('drift gates', () => {
    test('release train: internal dependency versions match @zenithbuild/core exactly', () => {
        const coreManifest = JSON.parse(
            readFileSync(resolve(REPO_ROOT, 'zenith-core/package.json'), 'utf8')
        );
        const coreVersion = String(coreManifest.version || '');
        expect(coreVersion).toMatch(/^0\.\d+\.\d+-beta\./);

        const mismatches = [];
        for (const manifestRel of TRAIN_MANIFESTS) {
            const manifestPath = resolve(REPO_ROOT, manifestRel);
            const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));

            for (const field of INTERNAL_DEP_FIELDS) {
                const deps = pkg[field] && typeof pkg[field] === 'object' ? pkg[field] : {};
                for (const [name, version] of Object.entries(deps)) {
                    if (!name.startsWith('@zenithbuild/')) {
                        continue;
                    }
                    if (version !== coreVersion) {
                        mismatches.push(`${manifestRel} :: ${field} :: ${name}@${version} (expected ${coreVersion})`);
                    }
                }
            }
        }

        expect(mismatches).toEqual([]);
    });

    test('release train: npm ls has no duplicate internal package versions', () => {
        const result = spawnSync(
            'npm',
            ['ls', '--json', ...INTERNAL_PACKAGE_NAMES],
            {
                cwd: REPO_ROOT,
                encoding: 'utf8',
                env: {
                    ...process.env,
                    npm_config_loglevel: 'error'
                }
            }
        );

        expect(result.status).toBe(0);
        const tree = JSON.parse(result.stdout || '{}');
        const versionsByPackage = collectInternalPackageVersions(tree);
        const duplicates = [];

        for (const name of INTERNAL_PACKAGE_NAMES) {
            const versions = [...(versionsByPackage.get(name) || new Set())];
            if (versions.length > 1) {
                duplicates.push(`${name}: ${versions.join(', ')}`);
            }
        }

        expect(duplicates).toEqual([]);
    });

    test('framework sources do not import React or jsx-runtime', () => {
        const targets = [
            resolve(REPO_ROOT, 'zenith-cli/src'),
            resolve(REPO_ROOT, 'zenith-runtime/src'),
            resolve(REPO_ROOT, 'zenith-router/src'),
            resolve(REPO_ROOT, 'zenith-bundler/src'),
            resolve(REPO_ROOT, 'zenith-compiler/zenith_compiler/src')
        ];
        const files = targets.flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.rs']));
        const hits = scanFiles(
            files,
            /\breact\/jsx-runtime\b|\bfrom\s+['"]react['"]|\bimport\s+React(?:\s|,|$)|\bzenhtml\b/
        );
        expect(hits).toEqual([]);
    });

    test('query-param SSR channel remains removed', () => {
        const targets = [
            resolve(REPO_ROOT, 'zenith-cli/src'),
            resolve(REPO_ROOT, 'zenith-runtime/src'),
            resolve(REPO_ROOT, 'zenith-router/src'),
            resolve(REPO_ROOT, 'zenith-bundler/src')
        ];
        const files = targets.flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.rs']));
        const hits = scanFiles(files, /__zenith_ssr=/);
        expect(hits).toEqual([]);
    });

    test('no pushState or replaceState soft-nav escapes into the router runtime', () => {
        const targets = [
            resolve(REPO_ROOT, 'zenith-router/src'),
            resolve(REPO_ROOT, 'zenith-bundler/src'),
            resolve(REPO_ROOT, 'zenith-router/template.js'),
            resolve(REPO_ROOT, 'zenith-runtime/src')
        ];

        const files = targets.flatMap((pathStr) => {
            return pathStr.endsWith('.js') ? [pathStr] : collectFiles(pathStr, ['.js', '.ts', '.rs']);
        });

        const hits = scanFiles(files, /history\.(?:push|replace)State/);
        expect(hits).toEqual([]);
    });

    test('no eval or new Function in framework runtime outputs', () => {
        const targets = [
            resolve(REPO_ROOT, 'zenith-router/src'),
            resolve(REPO_ROOT, 'zenith-bundler/src'),
            resolve(REPO_ROOT, 'zenith-router/template.js'),
            resolve(REPO_ROOT, 'zenith-runtime/src')
        ];

        const files = targets.flatMap((pathStr) => {
            return pathStr.endsWith('.js') ? [pathStr] : collectFiles(pathStr, ['.js', '.ts', '.rs']);
        });

        const hits = scanFiles(files, /\beval\(|\bnew\s+Function\(/);
        expect(hits).toEqual([]);
    });

    test('dist bundles exclude forbidden routing/runtime primitives', async () => {
        const root = await mkdtemp(join(tmpdir(), 'zenith-drift-gates-'));
        const pagesDir = join(root, 'pages');
        const outDir = join(root, 'dist');

        try {
            await mkdir(pagesDir, { recursive: true });
            await writeFile(
                join(pagesDir, 'index.zen'),
                '<html><head></head><body><a data-zen-link="true" href="/about">About</a></body></html>',
                'utf8'
            );
            await writeFile(
                join(pagesDir, 'about.zen'),
                '<html><head></head><body><h1>About</h1></body></html>',
                'utf8'
            );

            await build({ pagesDir, outDir, config: { softNavigation: true } });

            const files = collectFiles(outDir, ['.js']);
            const hits = scanFiles(
                files,
                /history\.(?:push|replace)State|\beval\(|\bnew\s+Function\(|__zenith_ssr=/
            );
            expect(hits).toEqual([]);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test('app source does not include frozen cms snapshots or svelte block tags', () => {
        const appSrc = resolve(REPO_ROOT, 'zenith-site-v0/src');
        const files = collectFiles(appSrc, ['.zen', '.ts', '.js']);

        const snapshotHits = scanFiles(
            files,
            /Object\.freeze\(\s*\[|cmsDocs|cmsPosts/
        );
        expect(snapshotHits).toEqual([]);

        const svelteHits = scanFiles(
            files.filter((file) => file.endsWith('.zen')),
            /\{#(if|each)|\{:(else|elseif)|\{\/(if|each)/
        );
        expect(svelteHits).toEqual([]);
    });

    test('no use of Object.freeze across app or framework source (except runtime)', () => {
        const targets = [
            resolve(REPO_ROOT, 'zenith-cli/src'),
            // zenith-runtime/src is intentionally excluded: Object.freeze is used
            // for internal state snapshots (state.js) and payload validation
            // (hydrate.js). Audited as safe in beta.2.
            // zenith-compiler is excluded: script.rs emits JS code containing
            // Object.freeze for IR descriptor tables.
            resolve(REPO_ROOT, 'zenith-router/src'),
            resolve(REPO_ROOT, 'zenith-bundler/src'),
            resolve(REPO_ROOT, 'zenith-site-v0/src')
        ];
        const files = targets.flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.rs', '.zen']));
        const hits = scanFiles(files, /Object\.freeze\(/);

        // Filter out this test file itself if it runs out of zenith-cli/tests (which it does, but we scan /src)
        expect(hits).toEqual([]);
    });

    test('no use of bare zenhtml macro across the framework or app', () => {
        const targets = [
            resolve(REPO_ROOT, 'zenith-cli/src'),
            resolve(REPO_ROOT, 'zenith-runtime/src'),
            resolve(REPO_ROOT, 'zenith-router/src'),
            resolve(REPO_ROOT, 'zenith-site-v0/src')
        ];
        const files = targets.flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.zen']));
        // Ban bare `zenhtml` but allow internal names (_zenhtml, __ZENITH_INTERNAL_ZENHTML)
        const hits = scanFiles(files, /\bzenhtml\b/);
        expect(hits).toEqual([]);
    });

    test('compiler→runtime naming contract: __ZENITH_INTERNAL_ZENHTML binding matches across packages', () => {
        // Verify the runtime registers the internal binding
        const hydrateSource = readFileSync(
            resolve(REPO_ROOT, 'zenith-runtime/src/hydrate.js'),
            'utf8'
        );
        expect(hydrateSource).toContain('scope.__ZENITH_INTERNAL_ZENHTML');

        // Verify the CLI rewrites the legacy identifier to the same internal name
        const buildSource = readFileSync(
            resolve(REPO_ROOT, 'zenith-cli/src/build.js'),
            'utf8'
        );
        expect(buildSource).toContain('__ZENITH_INTERNAL_ZENHTML');
        // Confirm the rewrite target matches what the runtime binds
        expect(buildSource).toContain("'__ZENITH_INTERNAL_ZENHTML'");
    });

    test('no site specifics or cms leakage in core tooling', () => {
        const targets = [
            resolve(REPO_ROOT, 'zenith-cli/src'),
            resolve(REPO_ROOT, 'zenith-runtime/src'),
            resolve(REPO_ROOT, 'zenith-router/src'),
            resolve(REPO_ROOT, 'zenith-bundler/src'),
            resolve(REPO_ROOT, 'zenith-compiler/zenith_compiler/src')
        ];
        const files = targets.flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.rs']));
        const hits = scanFiles(files, /Directus|docs_pages|cmsDocs|cmsPosts/i);
        expect(hits).toEqual([]);
    });

    test('no absolute machine paths leak into generated type definitions', () => {
        const typesDir = resolve(REPO_ROOT, 'zenith-site-v0/.zenith');
        if (existsSync(typesDir)) {
            const files = collectFiles(typesDir, ['.ts']);
            const absoluteHits = scanFiles(files, new RegExp('/Users/|C:\\\\', 'i'));
            expect(absoluteHits).toEqual([]);
        }
    });

    test('create-zenith templates use only canonical event binding (on:click={...}, no onclick="..." or @click)', () => {
        const createZenithRoot = resolve(REPO_ROOT, 'create-zenith');
        const files = collectFiles(createZenithRoot, ['.zen']);
        const onclickHits = scanFiles(files, /onclick\s*=\s*["']/);
        const atClickHits = scanFiles(files, /@click\b/);
        expect(onclickHits).toEqual([]);
        expect(atClickHits).toEqual([]);
    });

    test('no magic globals (data, params, ctx) leak into generated type definitions', () => {
        const typesDir = resolve(REPO_ROOT, 'zenith-site-v0/.zenith');

        // Disallow skipping the test if types aren't initially checked in or present
        expect(existsSync(typesDir)).toBe(true);

        // Valid syntax
        const tmpValid = resolve(typesDir, 'zenith-test-valid.ts');
        writeFileSync(tmpValid, [
            '/// <reference path="./zenith-env.d.ts" />',
            'export const load: Zenith.Load = async (ctx) => {',
            '    const id = ctx.route.id;',
            '    return { ok: true };',
            '};'
        ].join('\n'));

        // This should not throw
        expect(() => {
            const result = spawnSync('npx', ['tsc', '--noEmit', '--strict', '--skipLibCheck', tmpValid], {
                stdio: 'ignore',
                shell: process.platform === 'win32'
            });
            if (result.status !== 0) throw new Error('TypeScript compilation failed for valid syntax');
        }).not.toThrow();
        unlinkSync(tmpValid);

        // Invalid syntax (magic globals)
        const tmpInvalid = resolve(typesDir, 'zenith-test-invalid.ts');
        writeFileSync(tmpInvalid, [
            '/// <reference path="./zenith-env.d.ts" />',
            'const d = data;',
            'const p = params;',
            'const c = ctx;'
        ].join('\n'));

        let threw = false;
        try {
            const result = spawnSync('npx', ['tsc', '--noEmit', '--strict', '--skipLibCheck', tmpInvalid], {
                stdio: 'ignore',
                shell: process.platform === 'win32'
            });
            if (result.status !== 0) {
                threw = true;
            }
        } catch (err) {
            threw = true;
        }
        unlinkSync(tmpInvalid);
        expect(threw).toBe(true);
    });
});
