// ---------------------------------------------------------------------------
// dev-server.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// Development server with in-memory compilation and file watching.
//
// - Compiles pages on demand
// - Rebuilds on file change
// - Injects HMR client script
// - No SPA fallback unless router: true
//
// V0: Uses Node.js http module + fs.watch. No external deps.
// ---------------------------------------------------------------------------

import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { build } from './build.js';

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const HMR_CLIENT_SCRIPT = `
<script>
// Zenith HMR Client V0
(function() {
    const es = new EventSource('/__zenith_hmr');
    es.onmessage = function(event) {
        if (event.data === 'reload') {
            window.location.reload();
        }
    };
    es.onerror = function() {
        setTimeout(function() { window.location.reload(); }, 1000);
    };
})();
</script>`;

/**
 * Create and start a development server.
 *
 * @param {{ pagesDir: string, outDir: string, port?: number, config?: object }} options
 * @returns {Promise<{ server: import('http').Server, port: number, close: () => void }>}
 */
export async function createDevServer(options) {
    const {
        pagesDir,
        outDir,
        port = 3000,
        config = {}
    } = options;

    /** @type {import('http').ServerResponse[]} */
    const hmrClients = [];
    let _watcher = null;

    // Initial build
    await build({ pagesDir, outDir, config });

    const server = createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        let pathname = url.pathname;

        // HMR endpoint
        if (pathname === '/__zenith_hmr') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            // Flush headers by sending initial comment
            res.write(': connected\n\n');
            hmrClients.push(res);
            req.on('close', () => {
                const idx = hmrClients.indexOf(res);
                if (idx !== -1) hmrClients.splice(idx, 1);
            });
            return;
        }

        // Resolve file path
        if (pathname === '/') {
            pathname = '/index.html';
        } else if (!extname(pathname)) {
            pathname += '/index.html';
        }

        const filePath = join(outDir, pathname);

        try {
            let content = await readFile(filePath, 'utf8');
            const ext = extname(filePath);
            const mime = MIME_TYPES[ext] || 'application/octet-stream';

            // Inject HMR script into HTML pages
            if (ext === '.html') {
                content = content.replace('</body>', `${HMR_CLIENT_SCRIPT}</body>`);
            }

            res.writeHead(200, { 'Content-Type': mime });
            res.end(content);
        } catch {
            // No SPA fallback unless router: true
            if (config.router === true) {
                try {
                    let indexContent = await readFile(join(outDir, 'index.html'), 'utf8');
                    indexContent = indexContent.replace('</body>', `${HMR_CLIENT_SCRIPT}</body>`);
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(indexContent);
                    return;
                } catch {
                    // fall through to 404
                }
            }

            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        }
    });

    /**
     * Broadcast HMR reload to all connected clients.
     */
    function _broadcastReload() {
        for (const client of hmrClients) {
            try {
                client.write('data: reload\n\n');
            } catch {
                // client disconnected
            }
        }
    }

    /**
     * Start watching the pages directory for changes.
     */
    function _startWatcher() {
        try {
            _watcher = watch(pagesDir, { recursive: true }, async (eventType, filename) => {
                if (!filename) return;

                // Rebuild
                await build({ pagesDir, outDir, config });
                _broadcastReload();
            });
        } catch {
            // fs.watch may not support recursive on all platforms
        }
    }

    return new Promise((resolve) => {
        server.listen(port, () => {
            const actualPort = server.address().port;
            _startWatcher();

            resolve({
                server,
                port: actualPort,
                close: () => {
                    if (_watcher) {
                        _watcher.close();
                        _watcher = null;
                    }
                    for (const client of hmrClients) {
                        try { client.end(); } catch { }
                    }
                    hmrClients.length = 0;
                    server.close();
                }
            });
        });
    });
}
