import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePreviewRouteFiles } from '../dist/preview/manifest.js';

let root;
let dist;
let privateAssets;
const page = { path: '/about', output: '/about/index.html', has_load: true };
const resource = { path: '/info', route_kind: 'resource', has_load: true };
const source = 'export function load(ctx) { return ctx.text("ready"); }';

async function put(dir, name, value) {
    await writeFile(join(dir, name + '-manifest.json'), JSON.stringify(value));
}

async function fixture(pages, resources) {
    const assets = join(dist, 'assets');
    await put(assets, 'resource', {
        base_path: '/', requires_server_metadata: true, requires_server_pages: pages.length > 0, routes: resources
    });
    if (pages.length) await put(assets, 'router', { base_path: '/', routes: pages });
    await put(privateAssets, 'resource', { base_path: '/', routes: resources.map((r) => ({ ...r, server_script: source })) });
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'zenith-preview-metadata-'));
    dist = join(root, 'static');
    privateAssets = join(root, 'server', 'preview', 'assets');
    await Promise.all([mkdir(join(dist, 'assets'), { recursive: true }), mkdir(privateAssets, { recursive: true })]);
});

afterEach(async () => { await rm(root, { recursive: true, force: true }); });

test('preview requires the matching private page inventory and server data', async () => {
    await fixture([page], []);
    const resolve = () => resolvePreviewRouteFiles(dist, root, {});
    expect(await resolve()).toBeNull();
    await writeFile(join(privateAssets, 'router-manifest.json'), '{');
    expect(await resolve()).toBeNull();
    await put(privateAssets, 'router', { routes: [] });
    expect(await resolve()).toBeNull();
    await put(privateAssets, 'router', { routes: [page] });
    expect(await resolve()).toBeNull();
    await put(privateAssets, 'router', { routes: [{ ...page, path: '/other', server_script: source }] });
    expect(await resolve()).toBeNull();
    await put(privateAssets, 'router', { base_path: '/', routes: [{ ...page, server_script: source }] });
    expect((await resolve()).routeState.pageRoutes).toHaveLength(1);
    await writeFile(join(privateAssets, 'resource-manifest.json'), '{');
    expect(await resolve()).toBeNull();
});

test('resource-only packages accept their complete private resource inventory', async () => {
    await fixture([], [resource]);
    const resolve = () => resolvePreviewRouteFiles(dist, root, {});
    expect((await resolve()).routeState.resourceRoutes.map((r) => r.path)).toEqual(['/info']);
    await put(privateAssets, 'resource', { routes: [] });
    expect(await resolve()).toBeNull();
});
