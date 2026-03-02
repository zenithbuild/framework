const express = require('express');
const { ZenithDevController } = require('./index.node'); // Assuming built target via napi
const path = require('path');
const chokidar = require('chokidar');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const port = 3000;

// Initialize Controller (Points to current project root)
// Default to parent directory (assuming zenith-bundler is inside project or sibling)
// Adjust this based on where you run the server.
const start = async (projectRoot = process.env.PROJECT_ROOT || path.resolve(__dirname, '..')) => {
    console.log(`[DevServer] Starting Zenith for: ${projectRoot}`);

    // Dynamic import of JS-based build logic (since dist/index.js is ESM)
    const { compileCssAsync, generateBundleJS, resolveGlobalsCss } = await import('./dist/index.js');

    let controller;
    try {
        controller = new ZenithDevController(projectRoot);
    } catch (e) {
        console.error("Failed to initialize ZenithDevController:Native controller access is opaque", e);
        console.error("Ensure you have built the native module: 'napi build --platform'");
        process.exit(1);
    }

    // Asset Cache
    const assets = {
        css: '',
        bundle: '',
        cssPath: null
    };

    // Helper: Rebuild Assets (JS Logic)
    async function rebuildAssets() {
        console.log('[DevServer] Rebuilding JS assets...');

        // 1. Build CSS
        const globalsCss = resolveGlobalsCss(projectRoot);
        if (globalsCss) {
            const res = await compileCssAsync({
                input: globalsCss,
                output: ':memory:',
                minify: false
            });
            if (res.success) {
                assets.css = res.css;
                console.log('[DevServer] CSS Compiled');
            } else {
                console.error('[DevServer] CSS Compile Failed:', res.error);
            }
        }

        // 2. Build Bundle
        // optimizing: reusing previous bundle if only CSS changed? No, fast enough.
        // We pass empty pluginData for now as we can't easily extract it from native controller.
        assets.bundle = generateBundleJS({});
        console.log('[DevServer] Bundle Generated');
    }

    // Initial Build
    await rebuildAssets();

    // Create HTTP and WS Server
    const server = http.createServer(app);
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        // console.log('[HMR] Client connected');
    });

    function notifyHMR() {
        // console.log('[HMR] Broadcasting update signal...');
        wss.clients.forEach((client) => {
            if (client.readyState === 1) { // OPEN
                client.send(JSON.stringify({ type: 'update' }));
            }
        });
    }

    // Watcher Integration
    const watchPath = path.join(projectRoot, 'src/**/*.zen');
    console.log(`[Watcher] Watching ${watchPath}`);
    const watcher = chokidar.watch(watchPath, {
        ignoreInitial: true
    });

    watcher.on('change', async (filePath) => {
        // console.log(`[Watcher] File changed: ${filePath}`);
        try {
            // 1. Tell Rust to re-compile (updates the AssetStore in RAM)
            console.time('Rebuild');
            await controller.rebuild();

            // 2. Rebuild JS assets (CSS/Bundle)
            if (filePath.endsWith('.css') || filePath.endsWith('.zen') || filePath.endsWith('.ts')) {
                await rebuildAssets();
            }

            console.timeEnd('Rebuild');

            // 3. Tell the Browser to fetch the new assets
            notifyHMR();
        } catch (e) {
            console.error("Rebuild failed:", e);
        }
    });

    // Serve Assets
    app.use(async (req, res, next) => {
        // Intercept Asset Requests (that Native Controller fails on)
        if (req.path === '/assets/styles.css') {
            res.setHeader('Content-Type', 'text/css');
            return res.send(assets.css);
        }
        if (req.path === '/assets/bundle.js') {
            res.setHeader('Content-Type', 'application/javascript');
            return res.send(assets.bundle);
        }

        // 1. Try to serve from native memory store (HTML mostly)
        const asset = controller.getAsset(req.path);

        if (asset) {
            let content = asset;

            // Inject Tags into HTML
            if (req.path === '/' || req.path.endsWith('.html')) {
                let html = content.toString();
                const cssTag = `<link rel="stylesheet" href="/assets/styles.css">`;
                const jsTag = `<script type="module" src="/assets/bundle.js"></script>`;

                // HMR Script
                const hmrScript = `
    <script>
    const ws = new WebSocket('ws://' + location.host);
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'update') {
            console.log('[HMR] Update received. Reloading...');
            location.reload(); 
        }
    };
    ws.onopen = () => console.log("[Zenith] HMR Connected");
    </script>`;

                if (html.includes("</head>")) {
                    html = html.replace("</head>", `${cssTag}${hmrScript}</head>`);
                } else {
                    html = `${cssTag}${hmrScript}${html}`;
                }

                if (html.includes("</body>")) {
                    html = html.replace("</body>", `${jsTag}</body>`);
                } else {
                    html = `${html}${jsTag}`;
                }

                res.setHeader('Content-Type', 'text/html');
                return res.send(html);
            }

            if (req.path.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript');
            } else if (req.path.endsWith('.css')) {
                res.setHeader('Content-Type', 'text/css');
            }
            return res.send(asset);
        }

        // 2. Fallback HTML (if native returns nothing for /)
        if (req.path === '/' || !path.extname(req.path)) {
            res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Zenith Dev</title>
    <link rel="stylesheet" href="/assets/styles.css">
    <script type="module" src="/assets/bundle.js"></script>
    <script>
    // HMR Client
    const ws = new WebSocket('ws://' + location.host);
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'update') {
            console.log('[HMR] Update received. Reloading...');
            location.reload(); 
        }
    };
    ws.onopen = () => console.log("[Zenith] HMR Connected");
    </script>
</head>
<body>
    <div id="app"></div>
</body>
</html>
        `);
            return;
        }

        next();
    });

    server.listen(port, () => {
        console.log(`Zenith Dev Server running at http://localhost:${port}`);
    });
};

module.exports = { start };
