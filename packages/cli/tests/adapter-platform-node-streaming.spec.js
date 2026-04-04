import { mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(30000);

async function createProject(files) {
    const root = join(tmpdir(), `zenith-node-streaming-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

async function requestChunkTrace(port, pathname) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: pathname,
            method: 'GET'
        }, (res) => {
            const chunks = [];
            const chunkTimes = [];
            res.on('data', (chunk) => {
                chunks.push(chunk.toString());
                chunkTimes.push(Date.now());
            });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    chunks,
                    chunkTimes,
                    startedAt,
                    endedAt: Date.now()
                });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

describe('node adapter streaming parity', () => {
    let projectRoot = null;
    let preview = null;

    afterEach(async () => {
        if (preview) {
            preview.close();
            preview = null;
        }
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            projectRoot = null;
        }
    });

    test('node target streams resource chunks and SSE without buffering the whole response', async () => {
        projectRoot = await createProject({
            'pages/api/ticker.resource.ts': [
                "import { stream } from 'zenith:server-contract';",
                'export async function load(ctx) {',
                '  void ctx;',
                '  async function* chunks() {',
                '    yield "tick-1";',
                '    await new Promise((resolve) => setTimeout(resolve, 120));',
                '    yield "tick-2";',
                '  }',
                '  return stream(chunks(), { contentType: "text/plain" });',
                '}'
            ].join('\n'),
            'pages/api/events.resource.ts': [
                "import { sse } from 'zenith:server-contract';",
                'export async function load(ctx) {',
                '  void ctx;',
                '  async function* events() {',
                '    yield { event: "ping", data: { count: 1 } };',
                '    await new Promise((resolve) => setTimeout(resolve, 120));',
                '    yield { event: "ping", data: { count: 2 } };',
                '  }',
                '  return sse(events());',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await cli(['build'], projectRoot);

        const mod = await import(pathToFileURL(join(projectRoot, 'dist', 'index.js')).href);
        preview = await mod.createNodeServer({
            distDir: join(projectRoot, 'dist'),
            port: 0,
            host: '127.0.0.1'
        });
        const origin = `http://127.0.0.1:${preview.port}`;

        const ticker = await requestChunkTrace(preview.port, '/api/ticker');
        expect(ticker.status).toBe(200);
        expect(ticker.headers['content-type']).toBe('text/plain');
        expect(ticker.headers['cache-control']).toBe('no-cache');
        expect(ticker.chunks).toEqual(['tick-1', 'tick-2']);
        expect(ticker.chunkTimes).toHaveLength(2);
        expect(ticker.chunkTimes[0]).toBeLessThan(ticker.endedAt - 80);

        const tickerHead = await fetch(`${origin}/api/ticker`, { method: 'HEAD' });
        expect(tickerHead.status).toBe(200);
        expect(tickerHead.headers.get('content-type')).toBe('text/plain');
        expect(tickerHead.headers.get('cache-control')).toBe('no-cache');
        expect(await tickerHead.text()).toBe('');

        const events = await requestChunkTrace(preview.port, '/api/events');
        expect(events.status).toBe(200);
        expect(events.headers['content-type']).toBe('text/event-stream; charset=utf-8');
        expect(events.headers['cache-control']).toBe('no-cache');
        expect(events.chunkTimes).toHaveLength(2);
        expect(events.chunkTimes[0]).toBeLessThan(events.endedAt - 80);
        expect(events.chunks.join('')).toBe(
            'event: ping\ndata: {"count":1}\n\n' +
            'event: ping\ndata: {"count":2}\n\n'
        );
    });
});
