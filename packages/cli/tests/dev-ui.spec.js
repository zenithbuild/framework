import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';

const CLI_ENTRY = fileURLToPath(new URL('../dist/index.js', import.meta.url));

function createProject() {
    const root = mkdtempSync(join(tmpdir(), 'zenith-cli-dev-ui-'));
    mkdirSync(join(root, 'src', 'pages'), { recursive: true });
    mkdirSync(join(root, 'src', 'styles'), { recursive: true });
    writeFileSync(join(root, 'src', 'styles', 'global.css'), 'main { color: red; }\n', 'utf8');
    writeFileSync(
        join(root, 'src', 'pages', 'index.zen'),
        [
            '<script setup="ts">',
            'import "../styles/global.css";',
            '</script>',
            '<main>Hello</main>'
        ].join('\n'),
        'utf8'
    );
    return root;
}

async function waitFor(predicate, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = predicate();
        if (value) {
            return value;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Timed out waiting for condition');
}

describe('cli dev ui output', () => {
    jest.setTimeout(20000);

    test('prints a compact startup block once and distinguishes css_update vs reload', async () => {
        const root = createProject();
        const pagePath = join(root, 'src', 'pages', 'index.zen');
        const cssPath = join(root, 'src', 'styles', 'global.css');
        const child = spawn(process.execPath, [CLI_ENTRY, 'dev', '--port', '0'], {
            cwd: root,
            env: {
                ...process.env,
                CI: '1',
                NO_COLOR: '1'
            }
        });

        let output = '';
        child.stdout.on('data', (chunk) => {
            output += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            output += chunk.toString();
        });

        try {
            await waitFor(() => output.includes('[zenith] ✓ OK     http://127.0.0.1:'), 12000);
            expect(output.match(/\[zenith\] • DEV    Starting dev server…/g) || []).toHaveLength(1);
            expect(output.match(/\[zenith\] • BUILD  Initial build \(id=0\)/g) || []).toHaveLength(1);
            expect(output.match(/\[zenith\] ✓ OK     http:\/\/127\.0\.0\.1:\d+/g) || []).toHaveLength(1);

            writeFileSync(cssPath, 'main { color: blue; }\n', 'utf8');
            await waitFor(() => output.includes('[zenith] • HMR    css_update (buildId=1)'), 12000);

            writeFileSync(
                pagePath,
                [
                    '<script setup="ts">',
                    'import "../styles/global.css";',
                    '</script>',
                    '<main>Hello again</main>'
                ].join('\n'),
                'utf8'
            );
            await waitFor(() => output.includes('[zenith] • HMR    reload (buildId=2)'), 12000);

            expect(output).not.toContain('[zenith] Request:');
            expect(output).not.toContain('[Zenith] guard(');
        } finally {
            child.kill('SIGTERM');
            await once(child, 'exit').catch(() => {});
            rmSync(root, { recursive: true, force: true });
        }
    });
});
