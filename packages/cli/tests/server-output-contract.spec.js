import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

async function createProject(files) {
    const root = join(tmpdir(), `zenith-server-output-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

function normalizeHashedAsset(value) {
    if (typeof value !== 'string') {
        return value;
    }
    return value.replace(/\.[a-f0-9]{8,}\.js$/i, '.[hash].js');
}

function normalizeServerRoute(projectRoot, route) {
    return {
        ...route,
        page_asset: normalizeHashedAsset(route.page_asset),
        page_asset_file: normalizeHashedAsset(route.page_asset_file),
        server_script_path: typeof route.server_script_path === 'string'
            ? route.server_script_path.replace(projectRoot, '<project>')
            : route.server_script_path
    };
}

describe('server output contract', () => {
    let projectRoot = null;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
            projectRoot = null;
        }
    });

    test('build emits stable server manifest metadata and route package layout', async () => {
        projectRoot = await createProject({
            'pages/secure/index.zen': [
                '<script server lang="ts">',
                'export async function guard(ctx) {',
                '  if (ctx.url.searchParams.get("auth") !== "yes") return ctx.redirect("/login", 307);',
                '  ctx.env.viewer = "allowed";',
                '  return ctx.allow();',
                '}',
                '</script>',
                '<main>secure</main>'
            ].join('\n'),
            'pages/secure/page.load.ts': [
                'export async function load(ctx) {',
                '  return ctx.data({ viewer: ctx.env.viewer });',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "vercel", basePath: "/docs" };\n'
        });

        await cli(['build'], projectRoot);

        const manifest = await readJson(join(projectRoot, '.zenith-output', 'server', 'manifest.json'));
        const routeJson = await readJson(join(projectRoot, '.zenith-output', 'server', 'routes', 'secure', 'route.json'));

        const normalizedManifest = {
            base_path: manifest.base_path,
            routes: manifest.routes.map((route) => normalizeServerRoute(projectRoot, route))
        };
        const normalizedRouteJson = normalizeServerRoute(projectRoot, routeJson);

        expect(normalizedManifest).toEqual({
            base_path: '/docs',
            routes: [
                {
                    name: 'secure',
                    path: '/secure',
                    output: '/secure/index.html',
                    base_path: '/docs',
                    page_asset: 'assets/secure.[hash].js',
                    page_asset_file: 'secure.[hash].js',
                    route_id: null,
                    server_script_path: '<project>/pages/secure/index.zen',
                    guard_module_ref: null,
                    load_module_ref: 'pages/secure/page.load.ts',
                    has_guard: true,
                    has_load: true,
                    params: [],
                    image_manifest_file: null,
                    image_config: {
                        formats: ['webp', 'avif'],
                        quality: 75,
                        deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
                        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
                        remotePatterns: [],
                        allowSvg: false,
                        maxRemoteBytes: 10485760,
                        maxPixels: 40000000,
                        minimumCacheTTL: 60,
                        dangerouslyAllowLocalNetwork: false
                    }
                }
            ]
        });
        expect(normalizedRouteJson).toEqual(normalizedManifest.routes[0]);

        expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'runtime', 'route-render.js'))).toBe(true);
        expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'server-contract.js'))).toBe(true);
        expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'images', 'payload.js'))).toBe(true);
        expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'images', 'materialize.js'))).toBe(true);
        expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'routes', 'secure', 'route', 'entry.js'))).toBe(true);
        expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'routes', 'secure', 'route', 'page.html'))).toBe(true);
        expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'routes', 'secure', 'modules', 'pages', 'secure', 'page.load.js'))).toBe(true);
    });
});
