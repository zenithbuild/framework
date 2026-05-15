import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { readRouteHandlerExport } from './route-handler-export-analysis.js';

const RESOURCE_EXTENSIONS = ['.resource.ts', '.resource.js', '.resource.mts', '.resource.cts', '.resource.mjs', '.resource.cjs'];
const FORBIDDEN_RESOURCE_EXPORT_RE =
    /\bexport\s+const\s+(?:data|prerender|exportPaths|ssr_data|props|ssr)\b/;

function assertSingleCtxArg(sourceFile, name, exportMatch) {
    if (exportMatch.arity !== null && exportMatch.arity !== 1) {
        throw new Error(
            `Zenith resource route contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: ${name}(ctx) must accept exactly one argument\n` +
            `  Example: export async function ${name}(ctx) { ... }`
        );
    }
}

function segmentsToRoute(segments) {
    const routeSegments = segments.map((seg) => {
        const optionalCatchAllMatch = seg.match(/^\[\[\.\.\.([a-zA-Z_][a-zA-Z0-9_]*)\]\]$/);
        if (optionalCatchAllMatch) {
            return `*${optionalCatchAllMatch[1]}?`;
        }

        const catchAllMatch = seg.match(/^\[\.\.\.([a-zA-Z_][a-zA-Z0-9_]*)\]$/);
        if (catchAllMatch) {
            return `*${catchAllMatch[1]}`;
        }

        const paramMatch = seg.match(/^\[([a-zA-Z_][a-zA-Z0-9_]*)\]$/);
        if (paramMatch) {
            return `:${paramMatch[1]}`;
        }
        return seg;
    });

    if (routeSegments.length > 0) {
        const last = routeSegments[routeSegments.length - 1];
        if (last === 'index' || last === 'page') {
            routeSegments.pop();
        }
    }

    return `/${routeSegments.join('/')}`;
}

export function isResourceRouteFile(fileName) {
    return RESOURCE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

export function resourceRouteFileToRoute(filePath, root) {
    const rel = relative(root, filePath);
    const extension = RESOURCE_EXTENSIONS.find((candidate) => rel.endsWith(candidate));
    if (!extension) {
        throw new Error(`[Zenith CLI] Resource route "${filePath}" does not use a supported .resource.* extension.`);
    }
    const withoutExt = rel.slice(0, -extension.length);
    const segments = withoutExt.split(sep).filter(Boolean);
    const route = segmentsToRoute(segments);
    return route === '/' ? '/' : route.replace(/\/+/g, '/');
}

export function analyzeResourceRouteModule(fullPath, root) {
    const source = readFileSync(fullPath, 'utf8').trim();
    if (!source) {
        throw new Error(
            `Zenith resource route contract violation:\n` +
            `  File: ${fullPath}\n` +
            `  Reason: resource route module is empty\n` +
            `  Example: export async function load(ctx) { return ctx.json({ ok: true }); }`
        );
    }

    if (FORBIDDEN_RESOURCE_EXPORT_RE.test(source)) {
        throw new Error(
            `Zenith resource route contract violation:\n` +
            `  File: ${fullPath}\n` +
            `  Reason: resource routes may only export guard(ctx), load(ctx), and action(ctx)\n` +
            `  Example: remove page-only exports such as data/prerender/exportPaths`
        );
    }

    const guardExport = readRouteHandlerExport(source, 'guard');
    const loadExport = readRouteHandlerExport(source, 'load');
    const actionExport = readRouteHandlerExport(source, 'action');

    for (const [name, exportMatch] of [
        ['guard', guardExport],
        ['load', loadExport],
        ['action', actionExport]
    ]) {
        if (exportMatch.matchCount > 1) {
            throw new Error(
                `Zenith resource route contract violation:\n` +
                `  File: ${fullPath}\n` +
                `  Reason: multiple ${name} exports detected\n` +
                `  Example: keep exactly one export for ${name}(ctx)`
            );
        }
        if (exportMatch.hasExport) {
            assertSingleCtxArg(fullPath, name, exportMatch);
        }
    }

    if (!loadExport.hasExport && !actionExport.hasExport) {
        throw new Error(
            `Zenith resource route contract violation:\n` +
            `  File: ${fullPath}\n` +
            `  Reason: resource routes must export load(ctx), action(ctx), or both\n` +
            `  Example: export async function load(ctx) { return ctx.text('ok'); }`
        );
    }

    return {
        path: resourceRouteFileToRoute(fullPath, root),
        file: relative(root, fullPath).replaceAll('\\', '/'),
        path_kind: resourceRouteFileToRoute(fullPath, root).split('/').some((segment) => segment.startsWith(':') || segment.startsWith('*'))
            ? 'dynamic'
            : 'static',
        render_mode: 'server',
        route_kind: 'resource',
        params: resourceRouteFileToRoute(fullPath, root)
            .split('/')
            .filter(Boolean)
            .filter((segment) => segment.startsWith(':') || segment.startsWith('*'))
            .map((segment) => {
                const raw = segment.slice(1);
                return raw.endsWith('?') ? raw.slice(0, -1) : raw;
            }),
        server_script: source,
        server_script_path: fullPath,
        has_guard: guardExport.hasExport,
        has_load: loadExport.hasExport,
        has_action: actionExport.hasExport
    };
}
