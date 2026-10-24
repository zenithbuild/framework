import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { normalizeBasePath } from '../base-path.js';
import { resolveBuildAdapter } from '../adapters/resolve-adapter.js';
import { isConfigKeyExplicit, isLoadedConfig, loadConfig, validateConfig } from '../config.js';
import { createTrustedOriginResolver } from '../request-origin.js';
import { supportsTargetRouteCheck } from '../route-check-support.js';
import { createSilentLogger } from '../ui/logger.js';
import { createPreviewRequestHandler } from './request-handler.js';

/**
 * Create and start a preview server.
 *
 * @param {{ distDir: string, port?: number, host?: string, logger?: object | null, config?: object, projectRoot?: string }} options
 * @returns {Promise<{ server: import('http').Server, port: number, close: () => void }>}
 */
export async function createPreviewServer(options) {
  const resolvedProjectRoot = options?.projectRoot ? resolve(options.projectRoot) : resolve(options.distDir, '..');
  const loadedConfig = await loadConfig(resolvedProjectRoot);
  const resolvedConfig = options?.config && typeof options.config === 'object'
    ? (() => {
      const overrideConfig = isLoadedConfig(options.config)
        ? options.config
        : validateConfig(options.config);
      const mergedConfig = { ...loadedConfig };
      for (const key of Object.keys(overrideConfig)) {
        if (isConfigKeyExplicit(overrideConfig, key)) {
          mergedConfig[key] = overrideConfig[key];
        }
      }
      return mergedConfig;
    })()
    : loadedConfig;
  const {
    distDir,
    port = 4000,
    host = '127.0.0.1',
    logger: providedLogger = null
  } = options;
  const projectRoot = resolvedProjectRoot;
  const config = resolvedConfig;
  const logger = providedLogger || createSilentLogger();
  const verboseLogging = logger.mode?.logLevel === 'verbose';
  const configuredBasePath = normalizeBasePath(config.basePath || '/');
  const resolvedTarget = resolveBuildAdapter(config).target;
  const routeCheckEnabled = supportsTargetRouteCheck(resolvedTarget);
  const isStaticExportTarget = resolvedTarget === 'static-export';
  let actualPort = port;
  const resolveServerOrigin = createTrustedOriginResolver({
    host,
    getPort: () => actualPort,
    label: 'preview server'
  });

  const server = createServer(createPreviewRequestHandler({
    distDir,
    projectRoot,
    config,
    logger,
    verboseLogging,
    configuredBasePath,
    routeCheckEnabled,
    isStaticExportTarget,
    serverOrigin: resolveServerOrigin
  }));

  return new Promise((resolveServer) => {
    server.listen(port, host, () => {
      actualPort = server.address().port;
      resolveServer({
        server,
        port: actualPort,
        close: () => {
          server.close();
        }
      });
    });
  });
}
