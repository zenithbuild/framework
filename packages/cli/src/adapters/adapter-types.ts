export const KNOWN_TARGETS = [
    'static',
    'static-export',
    'vercel-static',
    'netlify-static',
    'vercel',
    'netlify',
    'node'
];

export type ZenithTarget =
    | 'static'
    | 'static-export'
    | 'vercel-static'
    | 'netlify-static'
    | 'vercel'
    | 'netlify'
    | 'node';

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

export interface ZenithAdapter {
    name: string;
    validateRoutes: (manifest: RouteManifestEntry[]) => void;
    adapt: (options: AdaptOptions) => Promise<void>;
}
