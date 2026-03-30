import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prependBasePath } from '../base-path.js';
import { compareRouteSpecificity } from '../server/resolve-request-route.js';
import { copyHostedPageRuntime } from './copy-hosted-page-runtime.js';
import { createNetlifyBasePathAssetRules, createNetlifyImageEndpointRule, createNetlifyRewriteRules } from './route-rules.js';
import { validateHostedResourceRoutes } from './validate-hosted-resource-routes.js';

function buildNetlifyServerRules(route, basePath = '/') {
    const destination = `/.netlify/functions/__zenith_${route.name}`;
    if (!Array.isArray(route.params) || route.params.length === 0) {
        return [`${prependBasePath(basePath, route.path === '/' ? '/' : route.path)} ${destination} 200!`];
    }

    const segments = route.path.split('/').filter(Boolean);
    const terminal = segments[segments.length - 1];
    const prefix = segments.slice(0, -1).join('/');
    const prefixPath = prefix ? `/${prefix}` : '';

    if (terminal.startsWith('*') && terminal.endsWith('?')) {
        const key = terminal.slice(1, -1);
        const exactPath = prefixPath || '/';
        const splatPath = prefixPath ? `${prefixPath}/*` : '/*';
        return [
            `${prependBasePath(basePath, exactPath)} ${destination}?__zenith_param_${key}= 200!`,
            `${prependBasePath(basePath, splatPath)} ${destination}?__zenith_param_${key}=:splat 200!`
        ];
    }

    if (terminal.startsWith('*')) {
        const key = terminal.slice(1);
        const splatPath = prefixPath ? `${prefixPath}/*` : '/*';
        return [`${prependBasePath(basePath, splatPath)} ${destination}?__zenith_param_${key}=:splat 200!`];
    }

    const sourcePath = `/${segments.map((segment) => segment.startsWith(':') ? segment : segment).join('/')}`;
    const query = route.params.map((param) => `__zenith_param_${param}=:${param}`).join('&');
    return [`${prependBasePath(basePath, sourcePath)} ${destination}?${query} 200!`];
}

function createFunctionSource(route) {
    return [
        "import { fileURLToPath } from 'node:url';",
        "import { dirname, join } from 'node:path';",
        "import { renderResourceRouteRequest, renderRouteRequest, extractInternalParams } from './_zenith/runtime/route-render.js';",
        '',
        'const __dirname = dirname(fileURLToPath(import.meta.url));',
        `const route = ${JSON.stringify(route, null, 2)};`,
        '',
        'function createHostedUnsupportedResponse(message) {',
        "  return new Response(message, { status: 501, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });",
        '}',
        '',
        'function isMultipartFormData(request) {',
        "  const contentType = request.headers.get('content-type') || '';",
        "  return /^multipart\\/form-data(?:\\s*;|$)/i.test(contentType.trim());",
        '}',
        '',
        'export default async function(request) {',
        '  const params = extractInternalParams(request.url, route);',
        "  if (route.route_kind === 'resource') {",
        '    if (isMultipartFormData(request)) {',
        "      return createHostedUnsupportedResponse('Hosted multipart resource routes are unsupported in this milestone');",
        '    }',
        '    const response = await renderResourceRouteRequest({',
        '      request,',
        '      route,',
        '      params,',
        `      routeModulePath: join(__dirname, '_zenith', 'routes', ${JSON.stringify(route.name)}, 'route', 'entry.js')`,
        '    });',
        "    if (response.headers.has('content-disposition')) {",
        "      return createHostedUnsupportedResponse('Hosted resource downloads are unsupported in this milestone');",
        '    }',
        '    return response;',
        '  }',
        '  return renderRouteRequest({',
        '    request,',
        '    route,',
        '    params,',
        `    routeModulePath: join(__dirname, '_zenith', 'routes', ${JSON.stringify(route.name)}, 'route', 'entry.js'),`,
        `    shellHtmlPath: join(__dirname, '_zenith', 'routes', ${JSON.stringify(route.name)}, 'route', 'page.html'),`,
        `    pageAssetPath: ${route.page_asset_file ? "join(__dirname, '_zenith', 'routes', " + JSON.stringify(route.name) + ", 'route', " + JSON.stringify(route.page_asset_file) + ')' : 'null'},`,
        `    imageManifestPath: ${route.image_manifest_file ? "join(__dirname, '_zenith', 'routes', " + JSON.stringify(route.name) + ", 'route', " + JSON.stringify(route.image_manifest_file) + ')' : 'null'},`,
        `    imageConfig: ${JSON.stringify(route.image_config || {}, null, 2)}`,
        '  });',
        '}',
        ''
    ].join('\n');
}

function createImageFunctionSource(imagesConfig) {
    return [
        "import { fileURLToPath } from 'node:url';",
        "import { dirname } from 'node:path';",
        "import { handleImageFetchRequest } from './_zenith/images/service.js';",
        '',
        'const __dirname = dirname(fileURLToPath(import.meta.url));',
        `const imageConfig = ${JSON.stringify(imagesConfig || {}, null, 2)};`,
        '',
        'export default async function(request) {',
        '  return handleImageFetchRequest(request, {',
        '    projectRoot: __dirname,',
        '    config: imageConfig',
        '  });',
        '}',
        ''
    ].join('\n');
}

async function loadServerManifest(coreOutput) {
    try {
        const parsed = JSON.parse(await readFile(join(coreOutput, 'server', 'manifest.json'), 'utf8'));
        return Array.isArray(parsed.routes) ? parsed.routes : [];
    } catch {
        return [];
    }
}

function buildRedirectsFile(buildManifest, serverRoutes) {
    const lines = [
        '# Generated by Zenith netlify adapter',
        ...createNetlifyBasePathAssetRules(buildManifest.base_path),
        createNetlifyImageEndpointRule(buildManifest.base_path)
    ];
    const seen = new Set();

    for (const route of [...serverRoutes].sort((left, right) => compareRouteSpecificity(left.path, right.path))) {
        for (const line of buildNetlifyServerRules(route, buildManifest.base_path)) {
            if (seen.has(line)) {
                continue;
            }
            seen.add(line);
            lines.push(line);
        }
    }

    for (const route of buildManifest.routes.filter((entry) => entry.render_mode === 'prerender' && entry.path_kind === 'dynamic')) {
        for (const line of createNetlifyRewriteRules(route, buildManifest.base_path)) {
            if (seen.has(line)) {
                continue;
            }
            seen.add(line);
            lines.push(line);
        }
    }

    return `${lines.join('\n')}\n`;
}

export const netlifyAdapter = {
    name: 'netlify',
    validateRoutes(manifest) {
        validateHostedResourceRoutes(manifest, 'netlify');
    },
    async adapt(options) {
        const publishDir = join(options.outDir, 'publish');
        const functionsDir = join(options.outDir, 'functions');
        const staticDir = join(options.coreOutput, 'static');
        // Route meaning is fixed upstream in the manifest/server package.
        // The adapter only maps already-classified output into Netlify's layout.
        const serverRoutes = await loadServerManifest(options.coreOutput);

        await rm(options.outDir, { recursive: true, force: true });
        await mkdir(publishDir, { recursive: true });
        await mkdir(functionsDir, { recursive: true });
        await cp(staticDir, publishDir, { recursive: true, force: true });
        await writeFile(join(functionsDir, 'package.json'), '{\n  "type": "module"\n}\n', 'utf8');

        await copyHostedPageRuntime(options.coreOutput, join(functionsDir, '_zenith'));
        await writeFile(
            join(functionsDir, '__zenith_image.mjs'),
            createImageFunctionSource(options.config?.images || {}),
            'utf8'
        );
        for (const route of serverRoutes) {
            await cp(
                join(options.coreOutput, 'server', 'routes', route.name),
                join(functionsDir, '_zenith', 'routes', route.name),
                { recursive: true, force: true }
            );
            await writeFile(
                join(functionsDir, `__zenith_${route.name}.mjs`),
                createFunctionSource(route),
                'utf8'
            );
        }

        await writeFile(join(publishDir, '_redirects'), buildRedirectsFile(options.manifest, serverRoutes), 'utf8');
        await writeFile(
            join(options.outDir, 'netlify.toml'),
            [
                '[build]',
                'publish = "publish"',
                '',
                '[functions]',
                'directory = "functions"',
                'node_bundler = "esbuild"',
                ''
            ].join('\n'),
            'utf8'
        );
    }
};
