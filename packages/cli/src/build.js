import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { resolveBuildAdapter } from './adapters/resolve-adapter.js';
import { normalizeBasePath } from './base-path.js';
import { rewriteSoftNavigationHrefBasePathInHtmlFiles } from './base-path-html.js';
import { writeBuildOutputManifest } from './build-output-manifest.js';
import { generateManifest } from './manifest.js';
import { buildComponentRegistry } from './resolve-components.js';
import {
    collectAssets,
    createCompilerWarningEmitter,
    runBundler
} from './build/compiler-runtime.js';
import { buildPageEnvelopes } from './build/page-loop.js';
import { deriveProjectRootFromPagesDir, ensureZenithTypeDeclarations } from './build/type-declarations.js';
import { materializeImageMarkupInHtmlFiles } from './images/materialize.js';
import { buildImageArtifacts } from './images/service.js';
import { injectImageMaterializationIntoRouterManifest } from './images/router-manifest.js';
import { createImageRuntimePayload, injectImageRuntimePayloadIntoHtmlFiles } from './images/payload.js';
import { supportsTargetRouteCheck } from './route-check-support.js';
import { createStartupProfiler } from './startup-profile.js';
import { writeServerOutput } from './server-output.js';
import { resolveBundlerBin } from './toolchain-paths.js';
import {
    createBundlerToolchain,
    createCompilerToolchain,
    ensureToolchainCompatibility,
    getActiveToolchainCandidate
} from './toolchain-runner.js';
import { maybeWarnAboutZenithVersionMismatch } from './version-check.js';

export { createCompilerWarningEmitter };

function createCompilerTotals() {
    return {
        pageMs: 0,
        ownerMs: 0,
        componentMs: 0,
        pageCalls: 0,
        ownerCalls: 0,
        componentCalls: 0,
        componentCacheHits: 0,
        componentCacheMisses: 0
    };
}

/**
 * Build pages into bundler envelopes, then emit assets through the bundler.
 *
 * @param {{
 *   pagesDir: string
 *   outDir: string
 *   config?: object
 *   logger?: object | null
 *   showBundlerInfo?: boolean
 * }} options
 * @returns {Promise<{ pages: number, assets: string[] }>}
 */
export async function build(options) {
    const { pagesDir, outDir, config = {}, logger = null, showBundlerInfo = true } = options;
    const startupProfile = createStartupProfiler('cli-build');
    const projectRoot = deriveProjectRootFromPagesDir(pagesDir);
    const coreOutputDir = join(projectRoot, '.zenith-output');
    const staticOutputDir = join(coreOutputDir, 'static');
    const srcDir = resolve(pagesDir, '..');
    const compilerBin = createCompilerToolchain({ projectRoot, logger });
    const bundlerBin = createBundlerToolchain({ projectRoot, logger });
    const compilerTotals = createCompilerTotals();
    const { target, adapter, mode } = resolveBuildAdapter(config);
    const basePath = normalizeBasePath(config.basePath || '/');
    const routeCheckEnabled = supportsTargetRouteCheck(target);
    const routerEnabled = config.router === true;
    const compilerOpts = {
        typescriptDefault: config.typescriptDefault === true,
        experimentalEmbeddedMarkup: config.embeddedMarkupExpressions === true,
        strictDomLints: config.strictDomLints === true
    };

    ensureToolchainCompatibility(bundlerBin);
    const resolvedBundlerCandidate = getActiveToolchainCandidate(bundlerBin);

    if (logger) {
        await startupProfile.measureAsync('version_mismatch_check', () => maybeWarnAboutZenithVersionMismatch({
            projectRoot,
            logger,
            command: 'build',
            bundlerBinPath: resolvedBundlerCandidate?.path || resolveBundlerBin(projectRoot)
        }));
    }

    const registry = startupProfile.measureSync('build_component_registry', () => buildComponentRegistry(srcDir));

    const manifest = await startupProfile.measureAsync(
        'generate_manifest',
        () => generateManifest(pagesDir, '.zen', { compilerOpts })
    );
    if (mode !== 'legacy') {
        adapter.validateRoutes(manifest);
    }
    await startupProfile.measureAsync('ensure_zenith_type_declarations', () => ensureZenithTypeDeclarations({
        manifest,
        pagesDir
    }));
    await startupProfile.measureAsync('reset_core_output', () => rm(coreOutputDir, { recursive: true, force: true }));
    await startupProfile.measureAsync('prepare_core_output', () => mkdir(staticOutputDir, { recursive: true }));

    const emitCompilerWarning = createCompilerWarningEmitter((line) => {
        if (logger && typeof logger.warn === 'function') {
            logger.warn(line, { onceKey: `compiler-warning:${line}` });
            return;
        }
        console.warn(line);
    });

    const { envelopes, expressionRewriteMetrics } = await buildPageEnvelopes({
        manifest,
        pagesDir,
        srcDir,
        registry,
        compilerOpts,
        compilerBin,
        routerEnabled,
        startupProfile,
        compilerTotals,
        emitCompilerWarning
    });

    if (envelopes.length > 0) {
        await startupProfile.measureAsync(
            'run_bundler',
            () => runBundler(
                envelopes,
                staticOutputDir,
                projectRoot,
                logger,
                showBundlerInfo,
                bundlerBin,
                { basePath, routeCheck: routeCheckEnabled }
            ),
            { envelopes: envelopes.length }
        );
        await startupProfile.measureAsync(
            'inject_image_materialization_manifest',
            () => injectImageMaterializationIntoRouterManifest(staticOutputDir, envelopes),
            { envelopes: envelopes.length }
        );
    }
    await startupProfile.measureAsync(
        'rewrite_soft_navigation_base_path',
        () => rewriteSoftNavigationHrefBasePathInHtmlFiles(staticOutputDir, basePath)
    );

    const { manifest: imageManifest } = await startupProfile.measureAsync(
        'build_image_artifacts',
        () => buildImageArtifacts({
            projectRoot,
            outDir: staticOutputDir,
            config: config.images
        })
    );
    const imageRuntimePayload = createImageRuntimePayload(
        config.images,
        imageManifest,
        'passthrough',
        basePath
    );
    await startupProfile.measureAsync(
        'materialize_image_markup',
        () => materializeImageMarkupInHtmlFiles({
            distDir: staticOutputDir,
            payload: imageRuntimePayload
        })
    );
    await startupProfile.measureAsync(
        'inject_image_runtime_payload',
        () => injectImageRuntimePayloadIntoHtmlFiles(staticOutputDir, imageRuntimePayload)
    );

    const buildManifest = await startupProfile.measureAsync(
        'write_core_manifest',
        () => writeBuildOutputManifest({
            coreOutputDir,
            staticDir: staticOutputDir,
            target,
            routeManifest: manifest,
            basePath
        })
    );
    await startupProfile.measureAsync(
        'write_server_output',
        () => writeServerOutput({
            coreOutputDir,
            staticDir: staticOutputDir,
            projectRoot,
            config,
            basePath
        })
    );
    await startupProfile.measureAsync(
        'adapt_output',
        () => adapter.adapt({ coreOutput: coreOutputDir, outDir, manifest: buildManifest, config })
    );
    const assets = await startupProfile.measureAsync('collect_assets', () => collectAssets(outDir));
    startupProfile.emit('build_complete', {
        pages: manifest.length,
        assets: assets.length,
        target,
        compilerTotals,
        expressionRewriteMetrics
    });
    return { pages: manifest.length, assets };
}
