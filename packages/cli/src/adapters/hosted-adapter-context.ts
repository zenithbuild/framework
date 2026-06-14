import type {
    AdapterManifestEntry,
    AdapterRouteManifest,
    BuildManifest
} from './adapter-types.js';

export type HostedBuiltInTarget = 'vercel' | 'netlify';

export interface HostedAdapterCapabilities {
    serverRendering: boolean;
    hostedFunctions: boolean;
    imageEndpoint: boolean;
    globalMiddleware: boolean;
    scopedServerData: boolean;
    resourceRoutes: boolean;
}

export interface HostedServerManifestRoute extends AdapterManifestEntry {
    name: string;
    page_asset_file?: string | null;
    image_manifest_file?: string | null;
    image_config?: unknown;
    has_scoped_server_data?: boolean;
    scoped_server_data?: unknown[];
}

export interface HostedServerManifest {
    routes: HostedServerManifestRoute[];
    global_middleware?: {
        module?: unknown;
        source_file?: unknown;
    };
}

export interface HostedAdapterContext {
    coreOutput: string;
    outDir: string;
    config: object;
    adapterName: string;
    target: string;
    builtInTarget?: HostedBuiltInTarget;
    buildManifest: BuildManifest;
    routeManifest: AdapterRouteManifest;
    serverManifest: HostedServerManifest | null;
    capabilities: HostedAdapterCapabilities;
}

export type HostedAdapterValidationContext = Pick<
    HostedAdapterContext,
    'adapterName' | 'target' | 'builtInTarget' | 'routeManifest' | 'capabilities'
>;

export interface CreateHostedAdapterContextInput {
    coreOutput: string;
    outDir: string;
    config: object;
    adapterName: string;
    target: string;
    buildManifest: BuildManifest;
    routeManifest: AdapterRouteManifest;
    serverManifest: HostedServerManifest | null;
    capabilities?: HostedAdapterCapabilities;
}

export const DEFAULT_HOSTED_ADAPTER_CAPABILITIES: HostedAdapterCapabilities = {
    serverRendering: true,
    hostedFunctions: true,
    imageEndpoint: true,
    globalMiddleware: true,
    scopedServerData: true,
    resourceRoutes: true
};

export function classifyHostedBuiltInTarget(target: string): HostedBuiltInTarget | undefined {
    if (target === 'vercel' || target === 'netlify') {
        return target;
    }

    return undefined;
}

export function createHostedAdapterContext(input: CreateHostedAdapterContextInput): HostedAdapterContext {
    const builtInTarget = classifyHostedBuiltInTarget(input.target);

    return {
        coreOutput: input.coreOutput,
        outDir: input.outDir,
        config: input.config,
        adapterName: input.adapterName,
        target: input.target,
        ...(builtInTarget ? { builtInTarget } : {}),
        buildManifest: input.buildManifest,
        routeManifest: input.routeManifest,
        serverManifest: input.serverManifest,
        capabilities: input.capabilities ?? DEFAULT_HOSTED_ADAPTER_CAPABILITIES
    };
}
