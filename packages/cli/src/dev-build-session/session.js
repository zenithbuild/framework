import { resolve } from 'node:path';

import { buildComponentRegistry } from '../resolve-components.js';
import { normalizeBasePath } from '../base-path.js';
import { collectAssets, runBundler } from '../build/compiler-runtime.js';
import { buildPageEnvelopes } from '../build/page-loop.js';
import { createPageLoopCaches } from '../build/page-loop-state.js';
import { deriveProjectRootFromPagesDir, ensureZenithTypeDeclarations } from '../build/type-declarations.js';
import { rewriteSoftNavigationHrefBasePathInHtmlFiles } from '../base-path-html.js';
import { injectImageMaterializationIntoRouterManifest } from '../images/router-manifest.js';
import { buildImageArtifacts } from '../images/service.js';
import { materializeImageMarkupInHtmlFiles } from '../images/materialize.js';
import { createImageRuntimePayload, injectImageRuntimePayloadIntoHtmlFiles } from '../images/payload.js';
import { createStartupProfiler } from '../startup-profile.js';
import { resolveBuildAdapter } from '../adapters/resolve-adapter.js';
import { supportsTargetRouteCheck } from '../route-check-support.js';
import {
    createBundlerToolchain,
    createCompilerToolchain,
    ensureToolchainCompatibility
} from '../toolchain-runner.js';
import {
    buildCompilerWarningEmitter,
    buildGlobalGraphHash,
    buildPageOnlyFastPathSignature,
    createCompilerTotals,
    createExpressionRewriteMetrics,
    isCssOnlyChange,
    maybeRunVersionCheck,
    orderEnvelopes,
    selectPageOnlyEntries,
    toManifestEntryMap
} from './helpers.js';
import { createDevBuildState } from './state.js';
import { generateManifest } from '../manifest.js';

export function createDevBuildSession(options) {
    const { pagesDir, outDir, config = {}, logger = null } = options;
    const resolvedPagesDir = resolve(pagesDir);
    const projectRoot = deriveProjectRootFromPagesDir(resolvedPagesDir);
    const srcDir = resolve(resolvedPagesDir, '..');
    const compilerBin = createCompilerToolchain({ projectRoot, logger });
    const bundlerBin = createBundlerToolchain({ projectRoot, logger });
    const routerEnabled = config.router === true;
    const { target } = resolveBuildAdapter(config);
    const basePath = normalizeBasePath(config.basePath || '/');
    const routeCheckEnabled = supportsTargetRouteCheck(target);
    const compilerOpts = {
        typescriptDefault: config.typescriptDefault === true,
        experimentalEmbeddedMarkup: config.embeddedMarkupExpressions === true,
        strictDomLints: config.strictDomLints === true
    };

    ensureToolchainCompatibility(bundlerBin);

    const state = createDevBuildState(config, basePath);

    async function syncImageState(startupProfile) {
        const { manifest } = await startupProfile.measureAsync(
            'build_image_artifacts',
            () => buildImageArtifacts({
                projectRoot,
                outDir,
                config: config.images
            })
        );
        state.imageManifest = manifest;
        state.imageRuntimePayload = createImageRuntimePayload(config.images, manifest, 'passthrough', basePath);
        await startupProfile.measureAsync(
            'materialize_image_markup',
            () => materializeImageMarkupInHtmlFiles({
                distDir: outDir,
                payload: state.imageRuntimePayload
            })
        );
        await startupProfile.measureAsync(
            'inject_image_runtime_payload',
            () => injectImageRuntimePayloadIntoHtmlFiles(outDir, state.imageRuntimePayload)
        );
    }

    async function runBundlerWithCachedEnvelopes(
        startupProfile,
        activeLogger,
        showBundlerInfo,
        bundlerOptions = {}
    ) {
        const orderedEnvelopes = bundlerOptions.envelopesOverride
            || orderEnvelopes(state.manifest, resolvedPagesDir, state.envelopeByFile);
        if (!orderedEnvelopes || orderedEnvelopes.length === 0) {
            throw new Error('Dev rebuild cache is incomplete; full rebuild required.');
        }

        await startupProfile.measureAsync(
            'run_bundler',
            () => runBundler(
                orderedEnvelopes,
                outDir,
                projectRoot,
                activeLogger,
                showBundlerInfo,
                bundlerBin,
                {
                    routeCheck: routeCheckEnabled,
                    basePath,
                    devStableAssets: true,
                    rebuildStrategy: bundlerOptions.rebuildStrategy || 'full',
                    changedRoutes: bundlerOptions.changedRoutes || [],
                    fastPath: bundlerOptions.fastPath === true,
                    globalGraphHash: bundlerOptions.globalGraphHash || ''
                }
            ),
            { envelopes: orderedEnvelopes.length }
        );
        await startupProfile.measureAsync(
            'inject_image_materialization_manifest',
            () => injectImageMaterializationIntoRouterManifest(outDir, orderedEnvelopes),
            { envelopes: orderedEnvelopes.length }
        );
        await startupProfile.measureAsync(
            'rewrite_soft_navigation_base_path',
            () => rewriteSoftNavigationHrefBasePathInHtmlFiles(outDir, basePath)
        );
        const assets = await startupProfile.measureAsync('collect_assets', () => collectAssets(outDir));
        return { assets, envelopeCount: orderedEnvelopes.length };
    }

    async function runFullBuild(activeLogger, showBundlerInfo) {
        const startupProfile = createStartupProfiler('cli-build');
        const compilerTotals = createCompilerTotals();

        await maybeRunVersionCheck({
            state,
            startupProfile,
            projectRoot,
            logger: activeLogger,
            bundlerBin
        });

        state.registry = startupProfile.measureSync('build_component_registry', () => buildComponentRegistry(srcDir));
        state.manifest = await startupProfile.measureAsync('generate_manifest', () => generateManifest(resolvedPagesDir));
        await startupProfile.measureAsync('ensure_zenith_type_declarations', () => ensureZenithTypeDeclarations({
            manifest: state.manifest,
            pagesDir: resolvedPagesDir
        }));

        state.pageLoopCaches = createPageLoopCaches();
        const emitCompilerWarning = buildCompilerWarningEmitter(activeLogger);
        const { envelopes, expressionRewriteMetrics } = await buildPageEnvelopes({
            manifest: state.manifest,
            pagesDir: resolvedPagesDir,
            srcDir,
            registry: state.registry,
            compilerOpts,
            compilerBin,
            routerEnabled,
            startupProfile,
            compilerTotals,
            emitCompilerWarning,
            pageLoopCaches: state.pageLoopCaches
        });

        state.envelopeByFile = new Map(envelopes.map((entry) => [entry.file, entry]));
        state.manifestEntryByPath = toManifestEntryMap(state.manifest, resolvedPagesDir);
        state.pageOnlyFastPathSignatureByFile = new Map(
            envelopes.map((entry) => [entry.file, buildPageOnlyFastPathSignature(entry)])
        );
        state.globalGraphHash = buildGlobalGraphHash(envelopes);
        const { assets } = await runBundlerWithCachedEnvelopes(startupProfile, activeLogger, showBundlerInfo);
        await syncImageState(startupProfile);

        startupProfile.emit('build_complete', {
            pages: state.manifest.length,
            assets: assets.length,
            compilerTotals,
            expressionRewriteMetrics,
            strategy: 'full'
        });

        state.hasSuccessfulBuild = true;
        return { pages: state.manifest.length, assets, strategy: 'full' };
    }

    async function runBundleOnlyBuild(activeLogger, showBundlerInfo) {
        const startupProfile = createStartupProfiler('cli-build');
        const compilerTotals = createCompilerTotals();
        const expressionRewriteMetrics = createExpressionRewriteMetrics();
        const { assets } = await runBundlerWithCachedEnvelopes(
            startupProfile,
            activeLogger,
            showBundlerInfo,
            { rebuildStrategy: 'bundle-only' }
        );
        await syncImageState(startupProfile);

        startupProfile.emit('build_complete', {
            pages: state.manifest.length,
            assets: assets.length,
            compilerTotals,
            expressionRewriteMetrics,
            strategy: 'bundle-only'
        });

        return { pages: state.manifest.length, assets, strategy: 'bundle-only' };
    }

    async function runPageOnlyBuild(entries, activeLogger, showBundlerInfo) {
        const startupProfile = createStartupProfiler('cli-build');
        const compilerTotals = createCompilerTotals();
        const emitCompilerWarning = buildCompilerWarningEmitter(activeLogger);
        const { envelopes, expressionRewriteMetrics } = await buildPageEnvelopes({
            manifest: entries,
            pagesDir: resolvedPagesDir,
            srcDir,
            registry: state.registry,
            compilerOpts,
            compilerBin,
            routerEnabled,
            startupProfile,
            compilerTotals,
            emitCompilerWarning,
            pageLoopCaches: state.pageLoopCaches
        });

        const previousFastPathSignatures = new Map(state.pageOnlyFastPathSignatureByFile);
        const canUseFastPath = entries.every((entry, index) => {
            const previous = previousFastPathSignatures.get(resolve(resolvedPagesDir, entry.file));
            const next = buildPageOnlyFastPathSignature(envelopes[index]);
            return typeof previous === 'string' && previous === next;
        });

        for (const envelope of envelopes) {
            state.envelopeByFile.set(envelope.file, envelope);
            state.pageOnlyFastPathSignatureByFile.set(
                envelope.file,
                buildPageOnlyFastPathSignature(envelope)
            );
        }
        const orderedEnvelopes = orderEnvelopes(state.manifest, resolvedPagesDir, state.envelopeByFile);
        if (!orderedEnvelopes || orderedEnvelopes.length === 0) {
            throw new Error('Dev rebuild cache is incomplete; full rebuild required.');
        }
        state.globalGraphHash = buildGlobalGraphHash(orderedEnvelopes);

        const { assets } = await runBundlerWithCachedEnvelopes(
            startupProfile,
            activeLogger,
            showBundlerInfo,
            {
                rebuildStrategy: 'page-only',
                changedRoutes: entries.map((entry) => entry.path),
                fastPath: canUseFastPath,
                envelopesOverride: canUseFastPath ? envelopes : orderedEnvelopes,
                globalGraphHash: canUseFastPath ? state.globalGraphHash : ''
            }
        );
        await syncImageState(startupProfile);
        startupProfile.emit('build_complete', {
            pages: state.manifest.length,
            assets: assets.length,
            compilerTotals,
            expressionRewriteMetrics,
            strategy: 'page-only',
            rebuiltPages: entries.length
        });

        return { pages: state.manifest.length, assets, strategy: 'page-only', rebuiltPages: entries.length };
    }

    return {
        async build(buildOptions = {}) {
            const activeLogger = buildOptions.logger || logger;
            const showBundlerInfo = buildOptions.showBundlerInfo !== false;
            const changedFiles = Array.isArray(buildOptions.changedFiles)
                ? [...new Set(buildOptions.changedFiles.map((entry) => resolve(String(entry))))]
                : [];

            if (!state.hasSuccessfulBuild || changedFiles.length === 0) {
                return runFullBuild(activeLogger, showBundlerInfo);
            }

            if (isCssOnlyChange(changedFiles)) {
                return runBundleOnlyBuild(activeLogger, showBundlerInfo);
            }

            const pageOnlyEntries = selectPageOnlyEntries(
                changedFiles,
                resolvedPagesDir,
                state.manifestEntryByPath
            );
            if (pageOnlyEntries.length > 0) {
                return runPageOnlyBuild(pageOnlyEntries, activeLogger, showBundlerInfo);
            }

            return runFullBuild(activeLogger, showBundlerInfo);
        },
        getImageRuntimePayload() {
            return state.imageRuntimePayload;
        }
    };
}
