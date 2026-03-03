import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    cpSync,
    existsSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CLI_PATH = resolve(process.cwd(), 'dist', 'cli.js');
const PACKAGE_ROOT = resolve(process.cwd());
const WORKSPACE_ROOT = resolve(process.cwd(), '..', '..');
const LOCAL_ZENITH_PACKAGES = [
    resolve(WORKSPACE_ROOT, 'packages', 'core'),
    resolve(WORKSPACE_ROOT, 'packages', 'cli'),
    resolve(WORKSPACE_ROOT, 'packages', 'compiler'),
    resolve(WORKSPACE_ROOT, 'packages', 'runtime'),
    resolve(WORKSPACE_ROOT, 'packages', 'router'),
    resolve(WORKSPACE_ROOT, 'packages', 'bundler')
];
const LOCAL_TAILWIND_PACKAGES = [
    resolve(WORKSPACE_ROOT, 'node_modules', '@tailwindcss', 'cli'),
    resolve(WORKSPACE_ROOT, 'node_modules', 'tailwindcss')
];
const FORBIDDEN_SOURCE_PATTERNS = [
    /\bprop\s+\w+\s*=/,
    /\bexport\s+let\b/,
    /onclick=|@click=|onClick=/
];
const FORBIDDEN_BUILD_PATTERNS = [
    /eval\(/,
    /new Function/,
    /__zenith_ssr=/,
    /zenhtml/,
    /history\.pushState/,
    /history\.replaceState/
];
const TEMPLATE_MATRIX = {
    basic: {
        styleFile: 'src/styles/global.css',
        usesTailwind: false,
        routes: ['/'],
        presentFiles: [
            'src/layouts/DefaultLayout.zen',
            'src/pages/index.zen',
            'src/public/logo.svg'
        ],
        absentFiles: [
            'pages',
            'src/pages/about.zen',
            'src/pages/blog.zen',
            'src/pages/docs.zen',
            'src/styles/globals.css'
        ]
    },
    css: {
        styleFile: 'src/styles/global.css',
        usesTailwind: false,
        routes: ['/', '/about', '/blog', '/docs'],
        presentFiles: [
            'src/layouts/DefaultLayout.zen',
            'src/pages/index.zen',
            'src/pages/about.zen',
            'src/pages/blog.zen',
            'src/pages/docs.zen',
            'src/public/logo.svg'
        ],
        absentFiles: ['src/styles/globals.css']
    },
    tailwind: {
        styleFile: 'src/styles/globals.css',
        usesTailwind: true,
        routes: ['/', '/about', '/blog', '/docs'],
        presentFiles: [
            'src/layouts/DefaultLayout.zen',
            'src/pages/index.zen',
            'src/pages/about.zen',
            'src/pages/blog.zen',
            'src/pages/docs.zen',
            'src/public/logo.svg'
        ],
        absentFiles: ['src/styles/global.css']
    }
};

function sanitizeChildEnv(env) {
    const next = { ...env };
    for (const key of Object.keys(next)) {
        if (key.startsWith('npm_')) {
            delete next[key];
        }
    }
    return next;
}

function run(cmd, args, cwd, env = process.env, timeout = 240_000) {
    const result = spawnSync(cmd, args, {
        cwd,
        env: sanitizeChildEnv(env),
        encoding: 'utf8',
        timeout
    });
    assert.equal(result.status, 0, `${cmd} ${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function collectFiles(rootDir, matcher) {
    const files = [];
    const queue = [rootDir];
    while (queue.length > 0) {
        const current = queue.pop();
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const fullPath = join(current, entry.name);
            if (entry.isDirectory()) {
                queue.push(fullPath);
                continue;
            }
            if (matcher(fullPath)) {
                files.push(fullPath);
            }
        }
    }
    return files.sort();
}

function scaffoldProject(
    tempRoot,
    name,
    template,
    { eslint = true, prettier = true, cliPath = CLI_PATH } = {}
) {
    const args = [cliPath, name, '--template', template];
    run(process.execPath, args, tempRoot, {
        ...process.env,
        ZENITH_NO_UI: '1',
        CI: '1',
        NO_COLOR: '1',
        CREATE_ZENITH_ESLINT: eslint ? '1' : '0',
        CREATE_ZENITH_PRETTIER: prettier ? '1' : '0',
        CREATE_ZENITH_TEMPLATE_MODE: 'local',
        CREATE_ZENITH_SKIP_INSTALL: '1'
    });

    return join(tempRoot, name);
}

function assertSourceContracts(projectDir) {
    const sourceFiles = collectFiles(projectDir, (file) => file.endsWith('.zen') || file.endsWith('.ts') || file.endsWith('.js'));
    const combined = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

    for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
        assert.equal(pattern.test(combined), false, `Forbidden template pattern: ${pattern}`);
    }

    assert.equal(combined.includes('on:click={'), true, 'Expected at least one on:click handler in template source');
}

function assertPackageDependencies(projectDir, template) {
    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
    const zenithDeps = Object.keys(pkg.dependencies || {}).filter((dep) => dep.startsWith('@zenithbuild/'));
    const devDependencies = pkg.devDependencies || {};

    assert.deepEqual(zenithDeps, ['@zenithbuild/core'], 'Template must only directly depend on @zenithbuild/core');
    assert.equal(String(pkg.dependencies['@zenithbuild/core']), 'latest');
    assert.equal(typeof devDependencies.tailwindcss === 'string', TEMPLATE_MATRIX[template].usesTailwind);
    assert.equal(typeof devDependencies['@tailwindcss/cli'] === 'string', TEMPLATE_MATRIX[template].usesTailwind);
}

function assertToolingSelection(projectDir, { eslint, prettier }) {
    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
    const devDependencies = pkg.devDependencies || {};
    const scripts = pkg.scripts || {};

    assert.equal(existsSync(join(projectDir, 'eslint.config.js')), eslint, 'eslint config presence mismatch');
    assert.equal(existsSync(join(projectDir, '.eslintrc.json')), false, 'legacy eslint config should never be scaffolded');
    assert.equal(existsSync(join(projectDir, '.prettierrc')), prettier, 'prettier config presence mismatch');
    assert.equal(existsSync(join(projectDir, '.prettierignore')), prettier, 'prettier ignore presence mismatch');

    assert.equal(typeof scripts.lint === 'string', eslint, 'lint script presence mismatch');
    assert.equal(typeof scripts.format === 'string', prettier, 'format script presence mismatch');

    assert.equal(typeof devDependencies.eslint === 'string', eslint, 'eslint dependency presence mismatch');
    assert.equal(typeof devDependencies['@typescript-eslint/eslint-plugin'] === 'string', eslint, 'eslint plugin dependency presence mismatch');
    assert.equal(typeof devDependencies['@typescript-eslint/parser'] === 'string', eslint, 'eslint parser dependency presence mismatch');
    assert.equal(typeof devDependencies.prettier === 'string', prettier, 'prettier dependency presence mismatch');
}

function assertTemplateShape(projectDir, template) {
    const config = TEMPLATE_MATRIX[template];
    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));

    assert.equal(existsSync(join(projectDir, config.styleFile)), true, `Missing template style file for ${template}`);

    for (const relativePath of config.presentFiles) {
        assert.equal(existsSync(join(projectDir, relativePath)), true, `Missing ${relativePath} for ${template}`);
    }

    for (const relativePath of config.absentFiles) {
        assert.equal(existsSync(join(projectDir, relativePath)), false, `Unexpected ${relativePath} for ${template}`);
    }

    const configSource = readFileSync(join(projectDir, 'zenith.config.js'), 'utf8');
    if (template === 'basic') {
        assert.match(configSource, /router:\s*false/);
    } else {
        assert.doesNotMatch(configSource, /router:\s*false/);
    }

    assert.equal(pkg.name, basename(projectDir), 'scaffolded package name should match project directory');
}

function installForBuild(projectDir, template) {
    const args = [
        'install',
        '--no-save',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--loglevel=error',
        ...LOCAL_ZENITH_PACKAGES
    ];

    if (TEMPLATE_MATRIX[template].usesTailwind) {
        args.push(...LOCAL_TAILWIND_PACKAGES);
    }

    run('npm', args, projectDir);
}

function patchRuntimeTemplateExport(projectDir) {
    const runtimePackagePath = join(projectDir, 'node_modules', '@zenithbuild', 'runtime', 'package.json');
    const runtimePkg = JSON.parse(readFileSync(runtimePackagePath, 'utf8'));
    const exportsMap = runtimePkg.exports && typeof runtimePkg.exports === 'object' ? runtimePkg.exports : {};

    if (!Object.prototype.hasOwnProperty.call(exportsMap, './template')) {
        exportsMap['./template'] = './dist/template.js';
        runtimePkg.exports = exportsMap;
        writeFileSync(runtimePackagePath, JSON.stringify(runtimePkg, null, 2));
    }
}

function assertBuildArtifacts(projectDir, template) {
    const distDir = join(projectDir, 'dist');

    assert.equal(existsSync(distDir), true, 'dist directory was not created');
    assert.equal(existsSync(join(distDir, 'index.html')), true, 'dist/index.html missing');

    for (const route of TEMPLATE_MATRIX[template].routes.filter((routePath) => routePath !== '/')) {
        const routeDir = route.slice(1);
        assert.equal(existsSync(join(distDir, routeDir, 'index.html')), true, `dist/${routeDir}/index.html missing`);
    }

    if (template === 'basic') {
        for (const routeDir of ['about', 'blog', 'docs']) {
            assert.equal(existsSync(join(distDir, routeDir, 'index.html')), false, `dist/${routeDir}/index.html should not exist`);
        }
    }
}

async function assertPreviewPayload(projectDir, template) {
    const previewModulePath = join(projectDir, 'node_modules', '@zenithbuild', 'cli', 'dist', 'preview.js');
    const { createPreviewServer } = await import(pathToFileURL(previewModulePath).href);
    const preview = await createPreviewServer({
        distDir: join(projectDir, 'dist'),
        port: 0
    });

    try {
        for (const route of TEMPLATE_MATRIX[template].routes) {
            const response = await fetch(`http://127.0.0.1:${preview.port}${route}`);
            const html = await response.text();

            assert.equal(response.status, 200, `Preview server did not return 200 for "${route}"`);
            assert.equal((html.match(/id=\"zenith-ssr-data\"/g) || []).length, 1, `Expected exactly one SSR payload script in "${route}"`);

            for (const pattern of FORBIDDEN_BUILD_PATTERNS) {
                assert.equal(pattern.test(html), false, `Forbidden build output pattern (${route}): ${pattern}`);
            }
        }
    } finally {
        preview.close();
    }
}

function snapshotTree(rootDir) {
    const files = collectFiles(rootDir, (file) => {
        const rel = relative(rootDir, file);
        return !rel.startsWith('dist/')
            && !rel.startsWith('node_modules/')
            && rel !== 'package-lock.json'
            && rel !== 'bun.lock';
    });

    return files.map((file) => {
        const rel = relative(rootDir, file);
        return `${rel}\n${readFileSync(file, 'utf8')}`;
    }).join('\n---\n');
}

function createExamplesFreeCliFixture() {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'create-zenith-package-fixture-'));
    const packageRoot = join(fixtureRoot, 'create-zenith');

    cpSync(join(PACKAGE_ROOT, 'dist'), join(packageRoot, 'dist'), { recursive: true });
    cpSync(join(PACKAGE_ROOT, 'templates'), join(packageRoot, 'templates'), { recursive: true });
    cpSync(join(PACKAGE_ROOT, 'package.json'), join(packageRoot, 'package.json'));

    return {
        fixtureRoot,
        packageRoot,
        cliPath: join(packageRoot, 'dist', 'cli.js')
    };
}

test('scaffolder works without examples present', () => {
    assert.equal(existsSync(CLI_PATH), true, 'dist/cli.js missing; run npm run build first');

    const fixture = createExamplesFreeCliFixture();
    const tempRoot = mkdtempSync(join(tmpdir(), 'create-zenith-no-examples-'));

    try {
        const projectDir = scaffoldProject(tempRoot, 'starter-no-examples', 'css', {
            cliPath: fixture.cliPath
        });

        assert.equal(existsSync(join(projectDir, 'package.json')), true, 'scaffolded package.json missing');
        assert.equal(existsSync(join(projectDir, 'src', 'pages', 'index.zen')), true, 'template source missing');
    } finally {
        rmSync(tempRoot, { recursive: true, force: true });
        rmSync(fixture.fixtureRoot, { recursive: true, force: true });
    }
});

for (const template of Object.keys(TEMPLATE_MATRIX)) {
    test(`${template} template scaffolds, installs, and builds clean`, async () => {
        assert.equal(existsSync(CLI_PATH), true, 'dist/cli.js missing; run npm run build first');

        const tempRoot = mkdtempSync(join(tmpdir(), `create-zenith-${template}-`));
        const projectDir = scaffoldProject(tempRoot, `${template}-smoke`, template);

        try {
            assertPackageDependencies(projectDir, template);
            assertSourceContracts(projectDir);
            assertTemplateShape(projectDir, template);
            installForBuild(projectDir, template);
            patchRuntimeTemplateExport(projectDir);
            run('npx', ['--no-install', 'zenith', 'build'], projectDir);
            assertBuildArtifacts(projectDir, template);
            await assertPreviewPayload(projectDir, template);
        } finally {
            rmSync(tempRoot, { recursive: true, force: true });
        }
    });
}

for (const template of Object.keys(TEMPLATE_MATRIX)) {
    for (const [eslint, prettier] of [
        [true, true],
        [true, false],
        [false, true],
        [false, false]
    ]) {
        test(`${template} template applies optional tooling correctly (eslint=${eslint}, prettier=${prettier})`, () => {
            assert.equal(existsSync(CLI_PATH), true, 'dist/cli.js missing; run npm run build first');

            const tempRoot = mkdtempSync(join(tmpdir(), `create-zenith-${template}-${eslint}-${prettier}-`));
            const projectDir = scaffoldProject(tempRoot, `${template}-tooling-${eslint}-${prettier}`, template, {
                eslint,
                prettier
            });

            try {
                assertToolingSelection(projectDir, { eslint, prettier });
                assertTemplateShape(projectDir, template);
            } finally {
                rmSync(tempRoot, { recursive: true, force: true });
            }
        });
    }
}

for (const template of Object.keys(TEMPLATE_MATRIX)) {
    test(`${template} template scaffolding is deterministic`, () => {
        assert.equal(existsSync(CLI_PATH), true, 'dist/cli.js missing; run npm run build first');

        const tempRoot = mkdtempSync(join(tmpdir(), `create-zenith-determinism-${template}-`));
        const tempRootB = mkdtempSync(join(tmpdir(), `create-zenith-determinism-${template}-`));

        try {
            const projectA = scaffoldProject(tempRoot, `${template}-deterministic`, template, {
                eslint: false,
                prettier: false
            });
            const projectB = scaffoldProject(tempRootB, `${template}-deterministic`, template, {
                eslint: false,
                prettier: false
            });

            assert.equal(snapshotTree(projectA), snapshotTree(projectB));
        } finally {
            rmSync(tempRoot, { recursive: true, force: true });
            rmSync(tempRootB, { recursive: true, force: true });
        }
    });
}
