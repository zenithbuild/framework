import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_ENTRY = fileURLToPath(new URL('../src/index.js', import.meta.url));
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
const SPINNER_REGEX = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏◐◓◑◒]/g;

function makeProject() {
    const root = mkdtempSync(join(tmpdir(), 'zenith-cli-ui-output-'));
    mkdirSync(join(root, 'pages'), { recursive: true });
    writeFileSync(
        join(root, 'pages', 'index.zen'),
        '<main><h1>Hello UI</h1></main>\n',
        'utf8'
    );
    return root;
}

function runBuild(cwd) {
    return spawnSync(
        process.execPath,
        [CLI_ENTRY, 'build'],
        {
            cwd,
            encoding: 'utf8',
            env: {
                ...process.env,
                ZENITH_NO_UI: '1',
                CI: '1',
                NO_COLOR: '1'
            }
        }
    );
}

describe('cli ui output', () => {
    test('plain mode output is deterministic and ANSI-free', () => {
        const projectRoot = makeProject();
        try {
            const result = runBuild(projectRoot);
            expect(result.status).toBe(0);

            const output = `${result.stdout}${result.stderr}`.replace(/\r/g, '');
            expect(output).not.toMatch(ANSI_REGEX);
            expect(output).not.toMatch(SPINNER_REGEX);
            expect(output).toContain('[zenith] INFO: Building...');
            expect(output).toContain('[zenith] OK: Built 1 page(s),');
            expect(output).toContain('[zenith] Output');

            expect(output).toMatchInlineSnapshot(`
"[zenith] INFO: Building...
[zenith] OK: Built 1 page(s), 4 asset(s)
[zenith] Output : ./dist
"
`);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });
});
