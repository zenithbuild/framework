// Probes for the "no @zenithbuild module references" guardrail in
// guardrails.spec.js: every module-loading form, in every module extension,
// must be reported, and real core must stay clean.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MODULE_EXTENSIONS, findZenithSpecifiers, scanZenithSpecifiers } from './support/zenith-specifiers.js';

const FORMS = {
    'import': "import { cli } from '@zenithbuild/cli';\n",
    'import-side-effect': "import '@zenithbuild/cli';\n",
    'export-from': "export * from '@zenithbuild/cli';\n",
    'dynamic-import-string': "await import('@zenithbuild/cli');\n",
    'dynamic-import-template': 'await import(`@zenithbuild/cli`);\n',
    'dynamic-import-template-expr': 'const name = "cli";\nawait import(`@zenithbuild/${name}`);\n',
    'require': "const cli = require('@zenithbuild/cli');\n",
    'require.resolve': "const p = require.resolve('@zenithbuild/cli');\n",
    'createRequire()()': "import { createRequire } from 'node:module';\nconst cli = createRequire(import.meta.url)('@zenithbuild/cli');\n",
    'createRequire().resolve': "import { createRequire } from 'node:module';\nconst p = createRequire(import.meta.url).resolve('@zenithbuild/cli');\n",
    'import.meta.resolve': "const p = import.meta.resolve('@zenithbuild/cli');\n",
    'concatenated-string': "await import('@zenith' + 'build/cli');\n",
    'specifier-in-variable': "const spec = '@zenithbuild/cli';\nawait import(spec);\n"
};

function scanProbe(ext, source) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenith-guardrail-probe-'));
    try {
        fs.mkdirSync(path.join(dir, 'config'));
        fs.writeFileSync(path.join(dir, 'config', `probe${ext}`), source);
        return scanZenithSpecifiers(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

describe('guardrail probes: @zenithbuild module references', () => {
    const cases = [];
    for (const [form, source] of Object.entries(FORMS)) {
        for (const ext of MODULE_EXTENSIONS) cases.push([form, ext, source]);
    }

    test.each(cases)('%s in a %s module fails the guardrail', (_form, ext, source) => {
        const { files, violations } = scanProbe(ext, source);
        expect(files).toEqual([`config/probe${ext}`]);
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0]).toContain(`config/probe${ext}:`);
    });

    test('each form is reported as its own kind, not only by the literal fallback', () => {
        const kinds = Object.fromEntries(Object.entries(FORMS).map(([form, source]) => [
            form, findZenithSpecifiers(source, 'probe.mjs').map((hit) => hit.kind)
        ]));
        expect(kinds).toEqual({
            'import': ['import'],
            'import-side-effect': ['import'],
            'export-from': ['export-from'],
            'dynamic-import-string': ['dynamic-import'],
            'dynamic-import-template': ['dynamic-import'],
            'dynamic-import-template-expr': ['dynamic-import'],
            'require': ['require'],
            'require.resolve': ['require.resolve'],
            'createRequire()()': ['createRequire()()'],
            'createRequire().resolve': ['createRequire().resolve'],
            'import.meta.resolve': ['import.meta.resolve'],
            'concatenated-string': ['dynamic-import'],
            'specifier-in-variable': ['string-literal']
        });
    });

    test('TypeScript-only forms are reported', () => {
        expect(findZenithSpecifiers("import cli = require('@zenithbuild/cli');\n", 'probe.cts').map((h) => h.kind))
            .toEqual(['import-equals']);
        expect(findZenithSpecifiers("type C = typeof import('@zenithbuild/cli');\n", 'probe.mts').map((h) => h.kind))
            .toEqual(['import-type']);
    });

    test.each(MODULE_EXTENSIONS)('comments and non-Zenith specifiers in a %s module pass', (ext) => {
        const source = [
            '// @zenithbuild/image is optional here',
            "/* import '@zenithbuild/cli' */",
            "import fs from 'node:fs';",
            "const mod = await import('./local.js');",
            "const p = import.meta.resolve('node:path');",
            "const message = 'install zenith';",
            ''
        ].join('\n');
        expect(scanProbe(ext, source).violations).toEqual([]);
    });
});
