import { isAbsolute, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertJsonSerializable } from '../server-contract/json-serializable.js';
import type { ManifestScopedServerDataEntry } from './types.js';

type ScopedEntry = ManifestScopedServerDataEntry & {
    module?: string;
};

type ScopedModule = {
    data?: unknown;
};

type ScopedModuleLoader = (entry: ScopedEntry) => Promise<ScopedModule>;

export interface ExecuteScopedServerDataOptions {
    route: {
        path?: string;
        route_kind?: string | null;
        prerender?: boolean;
        has_scoped_server_data?: boolean;
        scoped_server_data?: ScopedEntry[];
    };
    ctx: unknown;
    serverDir?: string | null;
    loadModule?: ScopedModuleLoader;
}

const INVALID_SCOPED_MODULE_PATH =
    '[Zenith:ScopedServerData] Invalid scoped server data module path.';
const PER_INSTANCE_DEFERRED =
    '[Zenith:ScopedServerData] Per-instance scoped server data execution is deferred to #99B.';

export function hasExecutableScopedServerData(route: ExecuteScopedServerDataOptions['route']): boolean {
    return route?.route_kind !== 'resource' &&
        route?.prerender !== true &&
        route?.has_scoped_server_data === true &&
        Array.isArray(route?.scoped_server_data) &&
        route.scoped_server_data.length > 0;
}

export function mergeScopedSsrPayload(routePayload: unknown, scopedPayload: Record<string, Record<string, unknown>>) {
    const routeData = isPlainRecord(routePayload) ? routePayload : {};
    if (Object.keys(scopedPayload || {}).length === 0) {
        return routeData;
    }
    return {
        ...routeData,
        route: routeData,
        scoped: scopedPayload
    };
}

export async function executeScopedServerData(
    options: ExecuteScopedServerDataOptions
): Promise<Record<string, Record<string, unknown>>> {
    const route = options.route || {};
    if (!hasExecutableScopedServerData(route)) {
        return {};
    }

    const scoped: Record<string, Record<string, unknown>> = {};
    const entries = route.scoped_server_data || [];
    for (const entry of entries) {
        const key = scopedPayloadKey(entry);
        const mod = await loadScopedModule(entry, options);
        const dataFn = mod?.data;
        if (typeof dataFn !== 'function') {
            throw new Error(
                `[Zenith:ScopedServerData] Scoped server data module "${entry.module || entry.ownerKey}" must export data(ctx, props).`
            );
        }

        const result = await dataFn(options.ctx, {});
        if (isRouteResultLike(result)) {
            throw new Error(
                `[Zenith:ScopedServerData] Scoped server data owner "${entry.ownerKey}" must return a plain serializable object, not a route result.`
            );
        }
        assertJsonSerializable(result, `${entry.ownerKey}: scoped data return`);
        scoped[key] = result as Record<string, unknown>;
    }
    return scoped;
}

async function loadScopedModule(entry: ScopedEntry, options: ExecuteScopedServerDataOptions): Promise<ScopedModule> {
    if (typeof options.loadModule === 'function') {
        return options.loadModule(entry);
    }
    if (typeof options.serverDir !== 'string' || options.serverDir.length === 0) {
        throw new Error(
            '[Zenith:ScopedServerData] Cannot execute scoped server data without a server module root.'
        );
    }
    const modulePath = resolveScopedServerModulePath(options.serverDir, entry.module);
    return import(pathToFileURL(modulePath).href);
}

function scopedPayloadKey(entry: ScopedEntry): string {
    const ownerKey = String(entry?.ownerKey || '');
    if (entry?.instanceStrategy === 'per-instance') {
        throw new Error(PER_INSTANCE_DEFERRED);
    }
    if (entry?.ownerKind === 'layout') {
        return `layout:${ownerKey}`;
    }
    if (entry?.ownerKind === 'component') {
        return `component:${ownerKey}`;
    }
    throw new Error(`[Zenith:ScopedServerData] Unsupported scoped server data owner kind "${String(entry?.ownerKind || '')}".`);
}

function resolveScopedServerModulePath(serverDir: string, modulePath: unknown): string {
    const raw = String(modulePath || '');
    if (!raw || isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
        throw new Error(INVALID_SCOPED_MODULE_PATH);
    }

    const normalized = raw.replace(/\\/g, '/');
    if (!normalized.startsWith('scoped/') || normalized.split('/').some((part) => part === '..' || part === '.')) {
        throw new Error(INVALID_SCOPED_MODULE_PATH);
    }

    const scopedRoot = resolve(serverDir, 'scoped');
    const outputPath = resolve(serverDir, normalized);
    if (outputPath !== scopedRoot && !outputPath.startsWith(`${scopedRoot}${sep}`)) {
        throw new Error(INVALID_SCOPED_MODULE_PATH);
    }
    return outputPath;
}

function isRouteResultLike(value: unknown): value is { kind: string } {
    return Boolean(
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof (value as { kind?: unknown }).kind === 'string'
    );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype || proto?.constructor?.name === 'Object';
}
