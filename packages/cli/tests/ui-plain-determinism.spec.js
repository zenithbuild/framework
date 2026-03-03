import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_ENTRY = fileURLToPath(new URL('../dist/index.js', import.meta.url));

function makeProject() {
    const root = mkdtempSync(join(tmpdir(), 'zenith-cli-ui-determinism-'));
    mkdirSync(join(root, 'pages'), { recursive: true });
    writeFileSync(
        join(root, 'pages', 'index.zen'),
        '<main><h1>Deterministic</h1></main>\n',
        'utf8'
    );
    return root;
}

function runBuild(cwd) {
    const result = spawnSync(
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
    return {
        status: result.status,
        output: `${result.stdout}${result.stderr}`.replace(/\r/g, '')
    };
}

describe('cli plain output determinism', () => {
    test('same command emits identical output across repeated runs', () => {
        const projectRoot = makeProject();
        try {
            const first = runBuild(projectRoot);
            const second = runBuild(projectRoot);

            expect(first.status).toBe(0);
            expect(second.status).toBe(0);
            expect(first.output).toBe(second.output);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });
});
