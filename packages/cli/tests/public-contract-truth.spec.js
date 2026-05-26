import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function collectFiles(dir, matcher) {
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
            const full = join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (matcher(full)) {
                out.push(full);
            }
        }
    }
    return out.sort();
}

function isLegacyArchive(file) {
    return file.includes('/_legacy_v1/');
}

function readRel(rel) {
    return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

describe('public contract truth', () => {
    test('package-facing docs do not reference removed zenith-docs paths or local machine paths', () => {
        const packageRoot = resolve(REPO_ROOT, 'packages');
        const files = collectFiles(packageRoot, (file) => file.endsWith('.md'));
        const hits = [];

        for (const file of files) {
            const source = readFileSync(file, 'utf8');
            if (source.includes('../zenith-docs') || source.includes('/Users/judahsullivan')) {
                hits.push(file.replace(`${REPO_ROOT}/`, ''));
            }
        }

        expect(hits).toEqual([]);
    });

    test('cli README and docs do not advertise fake plugin commands', () => {
        const docsRoot = resolve(REPO_ROOT, 'docs');
        const packageRoot = resolve(REPO_ROOT, 'packages');
        const files = [
            ...collectFiles(docsRoot, (file) => file.endsWith('.md')),
            ...collectFiles(packageRoot, (file) => file.endsWith('.md'))
        ].filter((file) => !isLegacyArchive(file));

        for (const file of files) {
            const source = readFileSync(file, 'utf8');
            expect(source).not.toMatch(/Plugin Management/i);
            expect(source).not.toMatch(/zenith add <plugin>/i);
            expect(source).not.toMatch(/zenith add/i);
            
            // Phase 1 Track B: Plugin & Extension Truth locks
            expect(source).not.toMatch(/beforeEach in router/i);
            expect(source).not.toMatch(/useZenOrder in content/i);
            expect(source).not.toMatch(/boundary between Core and Plugins/i);
            expect(source).not.toMatch(/define plugin-specific types/i);
        }

        const readme = readFileSync(resolve(REPO_ROOT, 'packages/cli/README.md'), 'utf8');
        expect(readme).toContain('### `zenith dev`');
        expect(readme).toContain('### `zenith build`');
        expect(readme).toContain('### `zenith preview`');
    });

    test('public docs keep the plugin surface limited to config-time V1 support', () => {
        const extensionContract = readFileSync(
            resolve(REPO_ROOT, 'docs/documentation/contracts/extension-contract.md'),
            'utf8'
        );

        expect(extensionContract).toContain('V1 plugin surface is intentionally config-time only');
        expect(extensionContract).toContain('Only `config()` in V1');
        expect(extensionContract).toContain('No public file transform hooks');
        expect(extensionContract).toContain('No plugin middleware registration');
        expect(extensionContract).toContain('Legacy `_legacy_v1` directories are archived internal snapshots');

        const docsRoot = resolve(REPO_ROOT, 'docs');
        const packageRoot = resolve(REPO_ROOT, 'packages');
        const files = [
            ...collectFiles(docsRoot, (file) => file.endsWith('.md') && !file.includes('/public/ai/')),
            ...collectFiles(packageRoot, (file) => file.endsWith('.md'))
        ].filter((file) => !isLegacyArchive(file));

        for (const file of files) {
            const source = readFileSync(file, 'utf8');
            expect(source).not.toMatch(/\bpublic\s+plugin\s+API\s+(?:is\s+)?(?:available|open)\b/i);
            expect(source).not.toMatch(/\bframework\s+installer\s+command\s+for\s+plugins?\b/i);
            expect(source).not.toMatch(/\bplugins?\s+(?:can|may)\s+(?:transform|register middleware|mutate routes|mutate security)\b/i);
        }
    });

    test('create-zenith docs describe the shipped templates and not the dead router preset', () => {
        const contract = readFileSync(resolve(REPO_ROOT, 'packages/create-zenith/CREATE_CONTRACT.md'), 'utf8');
        const readme = readFileSync(resolve(REPO_ROOT, 'packages/create-zenith/README.md'), 'utf8');

        expect(contract).toContain('| `basic` |');
        expect(contract).toContain('| `css` |');
        expect(contract).toContain('| `tailwind` |');
        expect(contract).not.toMatch(/\|\s*`router`\s*\|/);
        expect(contract).not.toContain('Only two presets are defined');
        expect(readme).not.toContain('Beta Version Pinning');
    });

    test('docs AGENTS delegates to the root contract instead of maintaining a conflicting fork', () => {
        const docsAgents = readFileSync(resolve(REPO_ROOT, 'docs/AGENTS.md'), 'utf8');

        expect(docsAgents).toContain('[`../AGENTS.md`](../AGENTS.md) is authoritative');
        expect(docsAgents).not.toContain('## Events (Universal)');
    });

    test('route-protection and server-data docs agree on guard/load/action as the canonical server contract', () => {
        const files = [
            'docs/documentation/contracts/server-data.md',
            'docs/documentation/reference/script-server.md',
            'docs/documentation/reference/server-data-api.md',
            'docs/documentation/contracts/no-magic.md',
            'docs/documentation/contracts/routing.md',
            'docs/documentation/routing/route-protection.md'
        ];

        for (const rel of files) {
            const source = readFileSync(resolve(REPO_ROOT, rel), 'utf8');
            expect(source).toMatch(/guard\(ctx\)/);
            expect(source).toMatch(/action\(ctx\)/);
        }
    });

    test('server export docs keep exportPaths scoped to the static-export prerender contract', () => {
        const files = [
            'docs/documentation/contracts/server-data.md',
            'docs/documentation/reference/script-server.md',
            'docs/documentation/reference/server-data-api.md'
        ];

        for (const rel of files) {
            const source = readFileSync(resolve(REPO_ROOT, rel), 'utf8');
            expect(source).toMatch(/exportPaths/);
            expect(source).toMatch(/static-export/);
        }
    });

    test('runtime and bundler package READMEs do not advertise removed public APIs', () => {
        const runtimeReadme = readFileSync(resolve(REPO_ROOT, 'packages/runtime/README.md'), 'utf8');
        const bundlerReadme = readFileSync(resolve(REPO_ROOT, 'packages/bundler/README.md'), 'utf8');

        expect(runtimeReadme).not.toMatch(/Virtual DOM|VDOM primitives|`h` and `fragment`/i);
        expect(bundlerReadme).not.toMatch(/cargo add zenith-bundler|bun add @zenithbuild\/bundler|generateRuntime\(manifest/i);
    });

    test('CORE_CONTRACT.md truthfully documents the current phase 1 config keys', () => {
        const coreContract = readFileSync(resolve(REPO_ROOT, 'packages/core/CORE_CONTRACT.md'), 'utf8');
        const expectedKeys = [
            'router',
            'embeddedMarkupExpressions',
            'typescriptDefault',
            'outDir',
            'pagesDir',
            'basePath',
            'target',
            'adapter',
            'strictDomLints',
            'images'
        ];

        for (const key of expectedKeys) {
            expect(coreContract).toContain(`${key}:`);
        }
        expect(coreContract).not.toMatch(/softNavigation:|assetPrefix:|types:/);
    });

    test('canonical docs document TypeScript-only root global middleware V1', () => {
        const guide = readRel('docs/documentation/routing/global-middleware.md');
        const supportingDocs = [
            'docs/documentation/contracts/server-data.md',
            'docs/documentation/reference/server-data-api.md',
            'docs/documentation/reference/script-server.md',
            'docs/documentation/contracts/routing.md',
            'docs/documentation/routing/route-protection.md',
            'docs/documentation/guides/deployment-targets.md',
            'docs/documentation/guides/using-ai-with-zenith.md',
            'docs/documentation/contracts/config-contract.md',
            'docs/documentation/contracts/extension-contract.md'
        ].map(readRel).join('\n');
        const source = `${guide}\n${supportingDocs}`;

        expect(guide).toContain('Root global middleware is a TypeScript-only server feature');
        expect(guide).toContain('{dirname(pagesDir)}/middleware.ts');
        expect(guide).toContain('{dirname(pagesDir)}/middleware/index.ts');
        expect(guide).toContain('middleware.js');
        expect(guide).toContain('middleware/index.js');
        expect(guide).toContain('middleware.tsx');
        expect(guide).toContain('middleware.mts');
        expect(guide).toContain('middleware.cts');
        expect(guide).toContain('Internal compiled `.js` output is an implementation detail');

        for (const target of ['dev', 'preview', 'node', 'vercel', 'netlify']) {
            expect(source).toMatch(new RegExp(`\\b${target}\\b`));
        }
        for (const target of ['static', 'static-export', 'vercel-static', 'netlify-static']) {
            expect(source).toContain(target);
        }

        expect(guide).toContain('return next()');
        expect(guide).toContain('await next()');
        expect(guide).toContain('return ctx.redirect');
        expect(guide).toContain('return ctx.deny');
        expect(guide).toContain('ctx.auth.requireSession({ redirectTo');
        expect(guide).toContain('ctx.auth.requireSession({ deny: 401');
        expect(guide).toContain('ctx.auth.signIn');
        expect(guide).toContain('ctx.auth.signOut');

        for (const rejected of [
            'return ctx.allow()',
            'return ctx.data(...)',
            'return ctx.invalid(...)',
            'return ctx.json(...)',
            'return ctx.text(...)',
            'return ctx.download(...)',
            'return new Response(...)',
            'plain object returns'
        ]) {
            expect(guide).toContain(rejected);
        }

        expect(source).toContain('route-check');
        expect(source).toMatch(/Global middleware does not run for route-check in V1/);
        expect(source).toMatch(/static output cannot enforce middleware/);
        expect(source).toMatch(/guard\(ctx\).*load\(ctx\).*canonical authorization boundary/s);
    });

    test('canonical and generated docs do not promote unsupported global middleware surfaces', () => {
        const rels = [
            'docs/documentation/routing/global-middleware.md',
            'docs/documentation/contracts/server-data.md',
            'docs/documentation/reference/server-data-api.md',
            'docs/documentation/reference/script-server.md',
            'docs/documentation/contracts/routing.md',
            'docs/documentation/routing/route-protection.md',
            'docs/documentation/contracts/config-contract.md',
            'docs/documentation/contracts/extension-contract.md',
            'docs/documentation/guides/deployment-targets.md',
            'docs/documentation/guides/using-ai-with-zenith.md',
            'docs/public/ai/docs.index.jsonl',
            'docs/public/ai/docs.manifest.json',
            'docs/public/ai/docs.nav.json',
            'docs/public/ai/docs.sitemap.json',
            'docs/public/llms.txt',
            'docs/public/rss.xml'
        ];
        const source = rels.map(readRel).join('\n');

        const forbiddenSupportClaims = [
            /\bsupports?\s+`?middleware\.js`?/i,
            /\b`?middleware\.js`?\s+is\s+supported\b/i,
            /\bsupports?\s+`?middleware\/index\.js`?/i,
            /\bsupports?\s+`?middleware\.(?:tsx|mts|cts)`?/i,
            /\bnested\s+middleware\s+(?:is|are)\s+supported\b/i,
            /\bmiddleware\s+arrays?\s+(?:is|are)\s+supported\b/i,
            /\bplugins?\s+(?:can|may)\s+register\s+middleware\b/i,
            /\bplugin\s+middleware\s+(?:is|are)\s+supported\b/i,
            /\bctx\.setHeader\b.{0,80}\b(?:supported|available|allowed)\b/i,
            /\barbitrary\s+headers?\s+(?:is|are)\s+supported\b/i,
            /\braw\s+Response\s+(?:is|returns?\s+are|support)\b/i,
            /\broute-check\s+(?:runs|executes|includes)\s+global\s+middleware\b/i,
            /\bglobal\s+middleware\s+runs\s+for\s+route-check\b/i,
            /\bstatic(?:-export)?\s+(?:can|does|will)\s+enforce\s+middleware\b/i,
            /\badapter\s+plugin\s+middleware\s+API\b.{0,80}\b(?:available|supported|open|exists)\b/i,
            /\bpublic\s+adapter\s+plugin\s+API\s+(?:is\s+)?(?:available|supported|open)\b/i
        ];

        for (const pattern of forbiddenSupportClaims) {
            expect(source).not.toMatch(pattern);
        }

        expect(source).toContain('No plugin middleware registration');
        expect(source).toContain('not a public adapter plugin API');
    });
});
