import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI_ENTRY = fileURLToPath(new URL('../src/index.js', import.meta.url));
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
const SPINNER_REGEX = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏◐◓◑◒]/g;

describe('cli ui non-tty mode', () => {
    test('non-tty plain output has no spinner/control artifacts', () => {
        const result = spawnSync(
            process.execPath,
            [CLI_ENTRY],
            {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    CI: '1'
                }
            }
        );

        const output = `${result.stdout}${result.stderr}`.replace(/\r/g, '');
        expect(result.status).toBe(0);
        expect(output).not.toMatch(ANSI_REGEX);
        expect(output).not.toMatch(SPINNER_REGEX);
        expect(output).toContain('Usage:');
    });
});
