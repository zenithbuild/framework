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
        ];

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
});
