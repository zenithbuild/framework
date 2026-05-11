export type { ZenithTarget } from './config-targets.js';

export type ZenithRenderMode = 'prerender' | 'server';
export type ZenithPathKind = 'static' | 'dynamic';

export interface RouteManifestEntry {
  path: string;
  file: string;
  path_kind: ZenithPathKind;
  render_mode: ZenithRenderMode;
  params: string[];
}

export interface BuildManifestRoute extends RouteManifestEntry {
  requires_hydration: boolean;
  html: string;
  assets: string[];
}

export interface BuildManifest {
  schema_version: number;
  zenith_version: string;
  target: string;
  base_path: string;
  content_hash: string;
  routes: BuildManifestRoute[];
  assets: {
    js: string[];
    css: string[];
    vendor: string | null;
  };
}

export interface ZenithAdapter {
  name: string;
  validateRoutes(manifest: RouteManifestEntry[]): void;
  adapt(options: {
    coreOutput: string;
    outDir: string;
    manifest: BuildManifest;
    config: Record<string, unknown>;
  }): Promise<void>;
}
