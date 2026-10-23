import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { createDevServer } from '../dist/dev-server.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(45000);

const CLI_ENTRY = fileURLToPath(new URL('../dist/index.js', import.meta.url));

async function createProject(files) {
    const root = join(tmpdir(), `zenith-dev-port-batch8-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return {
        root,
        pagesDir: join(root, 'pages'),
        outDir: join(root, 'dist')
    };
}

function createCliProject() {
    const root = join(tmpdir(), `zenith-cli-port-batch8-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(root, 'pages'), { recursive: true });
    writeFileSync(join(root, 'pages', 'index.zen'), '<main>Home</main>\n', 'utf8');
    return root;
}

function listen(server, port = 0) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
            server.off('error', reject);
            const address = server.address();
            resolve(address && typeof address === 'object' ? address.port : port);
        });
    });
}

function waitFor(predicate, timeoutMs = 12000) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        const tick = () => {
            const value = predicate();
            if (value) {
                resolve(value);
                return;
            }
            if (Date.now() >= deadline) {
                reject(new Error('Timed out waiting for condition'));
                return;
            }
            setTimeout(tick, 50);
        };
        tick();
    });
}

async function fetchText(url) {
    const response = await fetch(url);
    return {
        status: response.status,
        body: await response.text()
    };
}

describe('Batch 8 dev port conflict handling', () => {
    let project = null;
    let dev = null;
    let blocker = null;

    afterEach(async () => {
        if (dev) {
            dev.close();
            dev = null;
        }
        if (blocker) {
            await new Promise((resolve) => blocker.close(resolve)).catch(() => {});
            blocker = null;
        }
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('createDevServer starts on an available fallback port when requested port is occupied', async () => {
        project = await createProject({
            'pages/index.zen': '<main>Home</main>\n'
        });
        blocker = http.createServer((_req, res) => res.end('occupied'));
        const occupiedPort = await listen(blocker);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            host: '127.0.0.1',
            port: occupiedPort
        });

        expect(dev.requestedPort).toBe(occupiedPort);
        expect(dev.port).not.toBe(occupiedPort);
        expect(dev.portFallback?.occupiedPorts).toContain(occupiedPort);
        const page = await fetchText(`http://127.0.0.1:${dev.port}/`);
        expect(page.status).toBe(200);
        expect(page.body).toContain('Home');
    });

    test('CLI output reports requested, occupied, and final dev server URL', async () => {
        const root = createCliProject();
        blocker = http.createServer((_req, res) => res.end('occupied'));
        const occupiedPort = await listen(blocker);
        const child = spawn(process.execPath, [CLI_ENTRY, 'dev', '--port', String(occupiedPort)], {
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
            await waitFor(() => output.includes(`Requested port ${occupiedPort} is occupied; using`));
            expect(output).toContain(`Occupied port(s): ${occupiedPort}; serving at http://127.0.0.1:`);
            const match = output.match(/\[zenith\] ✓ OK\s+http:\/\/127\.0\.0\.1:(\d+)/);
            expect(match).not.toBeNull();
            expect(Number(match[1])).not.toBe(occupiedPort);
        } finally {
            child.kill('SIGTERM');
            await once(child, 'exit').catch(() => {});
            rmSync(root, { recursive: true, force: true });
        }
    });
});
