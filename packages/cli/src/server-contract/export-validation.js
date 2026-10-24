import { ALLOWED_KEYS, RESOURCE_ALLOWED_KEYS } from './constants.js';

function assertOneArgRouteFunction({ filePath, exportName, value }) {
    if (typeof value !== 'function') {
        throw new Error(`[Zenith] ${filePath}: "${exportName}" must be a function.`);
    }
    if (value.length !== 1) {
        throw new Error(`[Zenith] ${filePath}: "${exportName}(ctx)" must take exactly 1 argument.`);
    }
    const fnStr = value.toString();
    const paramsMatch = fnStr.match(/^[^{=]+\(([^)]*)\)/);
    if (paramsMatch && paramsMatch[1].includes('...')) {
        throw new Error(`[Zenith] ${filePath}: "${exportName}(ctx)" must not contain rest parameters.`);
    }
}

export function validateServerExports({ exports, filePath, routeKind = 'page' }) {
    const exportKeys = Object.keys(exports);
    const allowedKeys = routeKind === 'resource' ? RESOURCE_ALLOWED_KEYS : ALLOWED_KEYS;
    const illegalKeys = exportKeys.filter((key) => !allowedKeys.has(key));

    if (illegalKeys.length > 0) {
        throw new Error(`[Zenith] ${filePath}: illegal export(s): ${illegalKeys.join(', ')}`);
    }

    const hasData = 'data' in exports;
    const hasLoad = 'load' in exports;
    const hasGuard = 'guard' in exports;
    const hasAction = 'action' in exports;

    const hasNew = hasData || hasLoad || hasAction;
    const hasLegacy = ('ssr_data' in exports) || ('props' in exports) || ('ssr' in exports);

    if (routeKind === 'resource') {
        if (hasData) {
            throw new Error(`[Zenith] ${filePath}: resource routes may not export "data". Use load(ctx) or action(ctx) with ctx.json()/ctx.text().`);
        }
        if (!hasLoad && !hasAction) {
            throw new Error(`[Zenith] ${filePath}: resource routes must export load(ctx), action(ctx), or both.`);
        }
    }

    if (hasData && hasLoad) {
        throw new Error(`[Zenith] ${filePath}: cannot export both "data" and "load". Choose one.`);
    }

    if (routeKind === 'page' && hasNew && hasLegacy) {
        throw new Error(
            `[Zenith] ${filePath}: cannot mix new ("data"/"load") with legacy ("ssr_data"/"props"/"ssr") exports.`
        );
    }

    if (routeKind === 'page' && 'prerender' in exports && typeof exports.prerender !== 'boolean') {
        throw new Error(`[Zenith] ${filePath}: "prerender" must be a boolean.`);
    }
    if (routeKind === 'page' && 'exportPaths' in exports) {
        if (!Array.isArray(exports.exportPaths) || exports.exportPaths.some((value) => typeof value !== 'string')) {
            throw new Error(`[Zenith] ${filePath}: "exportPaths" must be an array of string pathnames.`);
        }
    }

    if (hasLoad) {
        assertOneArgRouteFunction({ filePath, exportName: 'load', value: exports.load });
    }

    if (hasGuard) {
        assertOneArgRouteFunction({ filePath, exportName: 'guard', value: exports.guard });
    }

    if (hasAction) {
        assertOneArgRouteFunction({ filePath, exportName: 'action', value: exports.action });
    }
}
