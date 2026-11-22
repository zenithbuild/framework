import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGE_LOOP_DIST = join(PACKAGE_ROOT, 'dist', 'build', 'page-loop.js');
const CLI_ENTRY = join(PACKAGE_ROOT, 'dist', 'index.js');
const DEBUG_ROUTE_LOG = '[DEBUG] Route';

function runBuild(cwd) {
    return spawnSync(process.execPath, [CLI_ENTRY, 'build'], {
        cwd,
        encoding: 'utf8',
        env: {
            ...process.env,
            ZENITH_NO_UI: '1',
            CI: '1',
            NO_COLOR: '1'
        }
    });
}

describe('page-loop debug route logs', () => {
    test('built page-loop.js does not ship leftover DEBUG route logs', () => {
        const source = readFileSync(PAGE_LOOP_DIST, 'utf8');
        expect(source).not.toContain(DEBUG_ROUTE_LOG);
        expect(source).not.toContain('is INTERACTIVE. Reasons:');
        expect(source).not.toContain('is STATIC (no JS required)');
        expect(source).toContain('detectRequiresJs');
        expect(source).toContain('requires_js: requiresJs');
    });

    test('interactive route build does not print DEBUG Route INTERACTIVE', () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 'zenith-cli-debug-log-'));
        mkdirSync(join(projectRoot, 'pages'), { recursive: true });
        writeFileSync(
            join(projectRoot, 'pages', 'index.zen'),
            [
                '<script lang="ts">',
                'state count = 0;',
                'function increment() { count = count + 1; }',
                '</script>',
                '<main><button on:click={increment}>{count}</button></main>'
            ].join('\n'),
            'utf8'
        );

        try {
            const result = runBuild(projectRoot);
            const output = `${result.stdout}${result.stderr}`;
            if (result.status !== 0) {
                throw new Error(`CLI build failed (${result.status}): ${output}`);
            }

            expect(output).not.toContain(DEBUG_ROUTE_LOG);
            expect(output).not.toMatch(/\[DEBUG\] Route .+ is INTERACTIVE/);
            const assetsDir = join(projectRoot, 'dist', 'assets');
            const emittedScript = readdirSync(assetsDir).some((name) => /\.m?js$/.test(name));
            expect(emittedScript).toBe(true);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    }, 120_000);
});
