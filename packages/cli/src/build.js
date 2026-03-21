import { resolve } from 'node:path';
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
import { createImageRuntimePayload, injectImageRuntimePayloadIntoHtmlFiles } from './images/payload.js';
import { createStartupProfiler } from './startup-profile.js';
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
    const srcDir = resolve(pagesDir, '..');
    const compilerBin = createCompilerToolchain({ projectRoot, logger });
    const bundlerBin = createBundlerToolchain({ projectRoot, logger });
    const compilerTotals = createCompilerTotals();
    const softNavigationEnabled = config.softNavigation === true || config.router === true;
    const compilerOpts = {
        typescriptDefault: config.typescriptDefault === true,
        experimentalEmbeddedMarkup: config.embeddedMarkupExpressions === true
            || config.experimental?.embeddedMarkupExpressions === true,
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
    if (registry.size > 0) {
        if (logger && typeof logger.build === 'function') {
            logger.build(`registry=${registry.size} components`, {
                onceKey: `component-registry:${registry.size}`
            });
        } else {
            console.log(`[zenith] Component registry: ${registry.size} components`);
        }
    }

    const manifest = await startupProfile.measureAsync('generate_manifest', () => generateManifest(pagesDir));
    await startupProfile.measureAsync('ensure_zenith_type_declarations', () => ensureZenithTypeDeclarations({
        manifest,
        pagesDir
    }));

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
        softNavigationEnabled,
        startupProfile,
        compilerTotals,
        emitCompilerWarning
    });

    if (envelopes.length > 0) {
        await startupProfile.measureAsync(
            'run_bundler',
            () => runBundler(envelopes, outDir, projectRoot, logger, showBundlerInfo, bundlerBin),
            { envelopes: envelopes.length }
        );
    }

    const { manifest: imageManifest } = await startupProfile.measureAsync(
        'build_image_artifacts',
        () => buildImageArtifacts({
            projectRoot,
            outDir,
            config: config.images
        })
    );
    const imageRuntimePayload = createImageRuntimePayload(config.images, imageManifest, 'passthrough');
    await startupProfile.measureAsync(
        'materialize_image_markup',
        () => materializeImageMarkupInHtmlFiles({
            distDir: outDir,
            payload: imageRuntimePayload
        })
    );
    await startupProfile.measureAsync(
        'inject_image_runtime_payload',
        () => injectImageRuntimePayloadIntoHtmlFiles(outDir, imageRuntimePayload)
    );

    const assets = await startupProfile.measureAsync('collect_assets', () => collectAssets(outDir));
    startupProfile.emit('build_complete', {
        pages: manifest.length,
        assets: assets.length,
        compilerTotals,
        expressionRewriteMetrics
    });
    return { pages: manifest.length, assets };
}
