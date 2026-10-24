import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { cli } from '../dist/index.js';
import { createPreviewServer } from '../dist/preview.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json'
};

async function createProject(files) {
    const root = join(tmpdir(), `zenith-static-export-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

function extractAssetPath(html) {
    const match =
        html.match(/src="([^"]*\/docs\/assets\/[^"]+\.js)"/)
        || html.match(/href="([^"]*\/docs\/assets\/[^"]+\.css)"/)
        || html.match(/(?:src|href)="([^"]*\/docs\/assets\/[^"]+)"/);
    expect(match).toBeTruthy();
    return String(match[1]);
}

async function fetchText(origin, pathname) {
    const response = await fetch(`${origin}${pathname}`, { redirect: 'manual' });
    return {
        status: response.status,
        body: await response.text(),
        headers: response.headers
    };
}

async function startPlainStaticServer(rootDir) {
    const root = resolve(rootDir);
    const server = createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        const initialPath = resolve(root, url.pathname.replace(/^\/+/, ''));
        if (initialPath !== root && !initialPath.startsWith(`${root}${sep}`)) {
            res.writeHead(404);
            res.end('not found');
            return;
        }

        const candidates = [initialPath];
        if (!extname(url.pathname)) {
            candidates.push(resolve(root, url.pathname.replace(/^\/+/, ''), 'index.html'));
        }

        let filePath = null;
        for (const candidate of candidates) {
            try {
                const info = await stat(candidate);
                if (info.isDirectory()) {
                    const indexPath = join(candidate, 'index.html');
                    const indexInfo = await stat(indexPath);
                    if (indexInfo.isFile()) {
                        filePath = indexPath;
                        break;
                    }
                    continue;
                }
                if (info.isFile()) {
                    filePath = candidate;
                    break;
                }
            } catch {
                continue;
            }
        }

        if (!filePath) {
            res.writeHead(404);
            res.end('not found');
            return;
        }

        const content = await readFile(filePath);
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream'
        });
        res.end(content);
    });

    await new Promise((resolveServer) => server.listen(0, '127.0.0.1', resolveServer));
    const address = server.address();
    return {
        port: typeof address === 'object' && address ? address.port : 0,
        close() {
            server.close();
        }
    };
}

describe('static-export adapter', () => {
    let projectRoot = null;
    let preview = null;
    let staticServer = null;

    afterEach(async () => {
        if (preview) {
            preview.close();
            preview = null;
        }
        if (staticServer) {
            staticServer.close();
            staticServer = null;
        }
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
            projectRoot = null;
        }
    });

    test('static-export emits concrete public files with no rewrite dependency', async () => {
        projectRoot = await createProject({
            'pages/index.zen': '<main>Home</main>\n',
            'pages/guides/[slug].zen': [
                '<script server lang="ts">',
                'export const prerender = true;',
                'export const exportPaths = ["/guides/guide", "/guides/api"];',
                'export const data = { section: "docs" };',
                '</script>',
                '<main>Docs Shell</main>'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "static-export", basePath: "/docs", router: true };\n'
        });

        await cli(['build'], projectRoot);

        expect(existsSync(join(projectRoot, 'dist', 'docs', 'index.html'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'docs', 'guides', 'guide', 'index.html'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'docs', 'guides', 'api', 'index.html'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'docs', 'guides', '__param_slug', 'index.html'))).toBe(false);
        expect(existsSync(join(projectRoot, 'dist', 'docs', 'assets', 'router-manifest.json'))).toBe(true);
        expect(existsSync(join(projectRoot, '.zenith-output', 'server'))).toBe(true);

        staticServer = await startPlainStaticServer(join(projectRoot, 'dist'));
        const staticOrigin = `http://127.0.0.1:${staticServer.port}`;

        const home = await fetchText(staticOrigin, '/docs/');
        expect(home.status).toBe(200);
        expect(home.body).toContain('src="/docs/assets/');

        const assetPath = extractAssetPath(home.body);
        const asset = await fetchText(staticOrigin, assetPath);
        expect(asset.status).toBe(200);
        expect(asset.headers.get('content-type')).toMatch(/javascript|css/);

        const guide = await fetchText(staticOrigin, '/docs/guides/guide');
        expect(guide.status).toBe(200);
        expect(guide.body).toContain('Docs Shell');

        const placeholder = await fetchText(staticOrigin, '/docs/guides/__param_slug/');
        expect(placeholder.status).toBe(404);

        const routeCheck = await fetchText(staticOrigin, '/docs/__zenith/route-check?path=%2Fdocs%2Fguides%2Fguide');
        expect(routeCheck.status).toBe(404);

        const imageEndpoint = await fetchText(staticOrigin, '/docs/_zenith/image');
        expect(imageEndpoint.status).toBe(404);

        preview = await createPreviewServer({
            distDir: join(projectRoot, 'dist'),
            port: 0
        });
        const previewOrigin = `http://127.0.0.1:${preview.port}`;

        const previewGuide = await fetchText(previewOrigin, '/docs/guides/guide');
        expect(previewGuide.status).toBe(200);
        expect(previewGuide.body).toContain('Docs Shell');

        const previewAsset = await fetchText(previewOrigin, assetPath);
        expect(previewAsset.status).toBe(200);
        expect(previewAsset.headers.get('content-type')).toMatch(/javascript|css/);

        const previewRouteCheck = await fetch(`${previewOrigin}/docs/__zenith/route-check?path=%2Fdocs%2Fguides%2Fguide`, {
            headers: { 'x-zenith-route-check': '1' }
        });
        expect(previewRouteCheck.status).toBe(501);
        expect(await previewRouteCheck.json()).toEqual({ error: 'route_check_unsupported' });

        const previewImage = await fetchText(previewOrigin, '/docs/_zenith/image');
        expect(previewImage.status).toBe(404);
    });

    test('static-export rejects dynamic prerender routes without exportPaths', async () => {
        projectRoot = await createProject({
            'pages/guides/[slug].zen': '<main>{params.slug}</main>\n',
            'zenith.config.js': 'module.exports = { target: "static-export" };\n'
        });

        await expect(cli(['build'], projectRoot)).rejects.toThrow(
            'target "static-export" requires explicit exportPaths for dynamic prerender routes'
        );
    });

    test('static-export rejects server render_mode routes', async () => {
        projectRoot = await createProject({
            'pages/account.zen': [
                '<script server lang="ts">',
                'export const data = { viewer: "admin" };',
                '</script>',
                '<main>{data.viewer}</main>'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "static-export" };\n'
        });

        await expect(cli(['build'], projectRoot)).rejects.toThrow(
            'target "static-export" cannot emit server-rendered routes'
        );
    });

    test('static-export rejects exportPaths that do not match the route pattern', async () => {
        projectRoot = await createProject({
            'pages/guides/[slug].zen': [
                '<script server lang="ts">',
                'export const prerender = true;',
                'export const exportPaths = ["/blog/post"];',
                '</script>',
                '<main>{params.slug}</main>'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "static-export" };\n'
        });

        await expect(cli(['build'], projectRoot)).rejects.toThrow(
            'exportPaths entry "/blog/post" does not match route "/guides/:slug"'
        );
    });
});
