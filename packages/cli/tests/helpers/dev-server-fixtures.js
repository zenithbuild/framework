import { mkdir, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';

const WORKSPACE_ROOT = join(process.cwd(), '..', '..');

export async function createTestProject(files) {
    const root = join(tmpdir(), `zenith-dev-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const pagesDir = join(root, 'pages');
    const outDir = join(root, 'dist');
    await mkdir(pagesDir, { recursive: true });

    for (const file of files) {
        const fullPath = join(pagesDir, file);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, `<div>${file}</div>`);
    }

    return { root, pagesDir, outDir };
}

export async function linkWorkspaceNodeModules(projectRoot) {
    const workspaceNodeModules = join(WORKSPACE_ROOT, 'node_modules');
    const target = join(projectRoot, 'node_modules');
    await symlink(workspaceNodeModules, target, 'dir').catch(() => { });
}

export function renderTailwindPage(className) {
    return [
        '<script setup="ts">',
        'import "../styles/global.css";',
        '</script>',
        `<main class="${className} font-bold">Home</main>`
    ].join('\n');
}

export async function createTailwindDevProject(initialClass = 'text-red-500') {
    const root = join(tmpdir(), `zenith-dev-tailwind-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const srcDir = join(root, 'src');
    const pagesDir = join(srcDir, 'pages');
    const stylesDir = join(srcDir, 'styles');
    const outDir = join(root, 'dist');
    const pageFile = join(pagesDir, 'index.zen');

    await mkdir(pagesDir, { recursive: true });
    await mkdir(stylesDir, { recursive: true });
    await linkWorkspaceNodeModules(root);
    await writeFile(join(stylesDir, 'global.css'), '@import "tailwindcss";\n', 'utf8');
    await writeFile(pageFile, renderTailwindPage(initialClass), 'utf8');

    return { root, pagesDir, outDir, pageFile };
}

export function httpGet(url, headers = undefined) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { headers }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
        });
        req.on('error', reject);
    });
}

export function parseSseBlock(block) {
    const lines = String(block || '').split('\n');
    const eventLine = lines.find((line) => line.startsWith('event: '));
    const dataLine = lines.find((line) => line.startsWith('data: '));
    const event = eventLine ? eventLine.slice(7).trim() : '';
    let data = {};
    if (dataLine) {
        try {
            data = JSON.parse(dataLine.slice(6));
        } catch {
            data = {};
        }
    }
    return { event, data };
}

export async function waitFor(predicate, { timeoutMs = 4000, intervalMs = 100 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const result = await predicate();
        if (result) {
            return result;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('Timed out waiting for condition');
}

export function localOrigin(port) {
    return `http://127.0.0.1:${port}`;
}

export async function getAvailablePort() {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = address && typeof address === 'object' ? address.port : 0;
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(port);
            });
        });
        server.on('error', reject);
    });
}
