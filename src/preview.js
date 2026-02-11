// ---------------------------------------------------------------------------
// preview.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// Static preview server.
//
// Serves /dist folder only.
// No compilation. No bundling. Pure static.
// Verifies build output is independent of dev mode.
// ---------------------------------------------------------------------------

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

/**
 * Create and start a static preview server.
 *
 * @param {{ distDir: string, port?: number }} options
 * @returns {Promise<{ server: import('http').Server, port: number, close: () => void }>}
 */
export async function createPreviewServer(options) {
    const { distDir, port = 4000 } = options;

    const server = createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        let pathname = url.pathname;

        // Resolve paths
        if (pathname === '/') {
            pathname = '/index.html';
        } else if (!extname(pathname)) {
            pathname += '/index.html';
        }

        const filePath = join(distDir, pathname);

        try {
            const content = await readFile(filePath);
            const ext = extname(filePath);
            const mime = MIME_TYPES[ext] || 'application/octet-stream';

            res.writeHead(200, { 'Content-Type': mime });
            res.end(content);
        } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        }
    });

    return new Promise((resolve) => {
        server.listen(port, () => {
            const actualPort = server.address().port;
            resolve({
                server,
                port: actualPort,
                close: () => { server.close(); }
            });
        });
    });
}
