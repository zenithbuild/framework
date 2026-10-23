import { ZENITH_TARGETS } from '@zenithbuild/core/config';

// Single source of truth: the shared config target list. The runtime list and
// the ZenithTarget type both derive from it, so they cannot drift.
export const KNOWN_TARGETS: readonly string[] = ZENITH_TARGETS;

export type ZenithTarget = typeof ZENITH_TARGETS[number];

export type ZenithRenderMode = 'prerender' | 'server';

export type ZenithPathKind = 'static' | 'dynamic';

export interface RouteManifestEntry {
    path: string;
    file: string;
    path_kind: ZenithPathKind;
    render_mode: ZenithRenderMode;
    params: string[];
    export_paths?: string[];
}

export interface BuildManifest {
    schema_version: number;
    zenith_version: string;
    target: string;
    base_path: string;
    content_hash: string;
    global_middleware?: { source_file: string };
    routes: Array<{
        path: string;
        file: string;
        path_kind: ZenithPathKind;
        render_mode: ZenithRenderMode;
        requires_hydration: boolean;
        params: string[];
        export_paths?: string[];
        html: string;
        assets: string[];
    }>;
    assets: {
        js: string[];
        css: string[];
        vendor: string | null;
    };
}

export interface AdaptOptions {
    coreOutput: string;
    outDir: string;
    manifest: BuildManifest;
    config: object;
}

export type AdapterResolutionMode = 'adapter' | 'target' | 'legacy';

export interface AdapterManifestEntry extends RouteManifestEntry {
    route_kind?: 'page' | 'resource';
    server_script?: string;
    server_script_path?: string;
    has_guard?: boolean;
    has_load?: boolean;
    has_action?: boolean;
}

export type AdapterRouteManifest = AdapterManifestEntry[];

export interface AdapterDriver {
    name: string;
    validateRoutes: (manifest: AdapterRouteManifest) => void;
    adapt: (options: AdaptOptions) => Promise<void>;
}

export interface ResolvedBuildAdapter {
    target: string;
    adapter: AdapterDriver;
    mode: AdapterResolutionMode;
}

export type ZenithAdapter = AdapterDriver;
