import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_ENTRY = fileURLToPath(new URL('../src/index.js', import.meta.url));
const SPINNER_REGEX = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏◐◓◑◒]/g;

function makeInvalidProject() {
    const root = mkdtempSync(join(tmpdir(), 'zenith-cli-ui-errors-'));
    mkdirSync(join(root, 'pages'), { recursive: true });
    writeFileSync(
        join(root, 'pages', 'index.zen'),
        [
            '<script server>',
            'export const data = { bad: true };',
            '</script>',
            '<main>Broken</main>'
        ].join('\n'),
        'utf8'
    );
    return root;
}

describe('cli ui error formatting', () => {
    test('error output is prefixed, structured, and spinner-safe', () => {
        const projectRoot = makeInvalidProject();
        try {
            const result = spawnSync(
                process.execPath,
                [CLI_ENTRY, 'build'],
                {
                    cwd: projectRoot,
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        ZENITH_NO_UI: '1',
                        NO_COLOR: '1',
                        CI: '1'
                    }
                }
            );

            expect(result.status).toBe(1);
            const output = `${result.stdout}${result.stderr}`.replace(/\r/g, '');
            expect(output).toContain('[zenith] ERROR: Command failed');
            expect(output).toContain('[zenith] Error Kind:');
            expect(output).toContain('[zenith] Phase:');
            expect(output).toContain('[zenith] Code:');
            expect(output).toContain('[zenith] File:');
            expect(output).toContain('[zenith] Hint: https://');
            expect(output).toContain('[zenith] Message:');
            expect(output).toContain('File: pages/index.zen');
            expect(output).not.toContain(`File: ${projectRoot}`);
            expect(output).not.toMatch(SPINNER_REGEX);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });
});
