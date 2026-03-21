import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { buildComponentRegistry } from './resolve-components.js';
import {
    collectAssets,
    createCompilerWarningEmitter,
    runBundler
} from './build/compiler-runtime.js';
import { buildPageEnvelopes } from './build/page-loop.js';
import { createPageLoopCaches } from './build/page-loop-state.js';
import { deriveProjectRootFromPagesDir, ensureZenithTypeDeclarations } from './build/type-declarations.js';
import { buildImageArtifacts } from './images/service.js';
import { createImageRuntimePayload } from './images/payload.js';
import { createStartupProfiler } from './startup-profile.js';
import { resolveBundlerBin } from './toolchain-paths.js';
import {
    createBundlerToolchain,
    createCompilerToolchain,
    ensureToolchainCompatibility,
    getActiveToolchainCandidate
} from './toolchain-runner.js';
import { maybeWarnAboutZenithVersionMismatch } from './version-check.js';
import { generateManifest } from './manifest.js';

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

function createExpressionRewriteMetrics() {
    return {
        calls: 0,
        cacheHits: 0,
        cacheMisses: 0,
        templateCompileMs: 0
    };
}

function toManifestEntryMap(manifest, pagesDir) {
    const map = new Map();
    for (const entry of manifest) {
        map.set(resolve(pagesDir, entry.file), entry);
    }
    return map;
}

function orderEnvelopes(manifest, pagesDir, envelopeByFile) {
    const ordered = [];
    for (const entry of manifest) {
        const envelope = envelopeByFile.get(resolve(pagesDir, entry.file));
        if (!envelope) {
            return null;
        }
        ordered.push(envelope);
    }
    return ordered;
}

function isCssOnlyChange(changedFiles) {
    return changedFiles.length > 0 && changedFiles.every((filePath) => filePath.endsWith('.css'));
}

function stableJson(value) {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
    }
    if (typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function collectJsImportSpecifiers(source) {
    const values = [];
    const patterns = [
        /\bimport\s+(?:[^'"\n;]*?\s+from\s+)?['"]([^'"]+)['"]/g,
        /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /\bexport\s+[^'"\n;]*?\s+from\s+['"]([^'"]+)['"]/g
    ];
    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        for (const match of source.matchAll(pattern)) {
            const value = String(match[1] || '').trim();
            if (value.length > 0 && !values.includes(value)) {
                values.push(value);
            }
        }
    }
    return values.sort();
}

function isExternalRuntimeSpecifier(specifier) {
    return !specifier.startsWith('.')
        && !specifier.startsWith('/')
        && !specifier.startsWith('@/') 
        && !specifier.startsWith('\0zenith:')
        && !specifier.includes('zenith:');
}

function collectEnvelopeAssetContract(envelope) {
    const cssImportSpecifiers = new Set();
    const externalImportSpecifiers = new Set();

    for (const entry of envelope.ir.hoisted?.imports || []) {
        for (const specifier of collectJsImportSpecifiers(String(entry || ''))) {
            if (specifier.endsWith('.css')) {
                cssImportSpecifiers.add(specifier);
            }
            if (isExternalRuntimeSpecifier(specifier)) {
                externalImportSpecifiers.add(specifier);
            }
        }
    }

    for (const moduleEntry of envelope.ir.modules || []) {
        for (const specifier of collectJsImportSpecifiers(String(moduleEntry?.source || ''))) {
            if (specifier.endsWith('.css')) {
                cssImportSpecifiers.add(specifier);
            }
            if (isExternalRuntimeSpecifier(specifier)) {
                externalImportSpecifiers.add(specifier);
            }
        }
    }

    for (const importEntry of envelope.ir.imports || []) {
        const specifier = String(importEntry?.spec || '').trim();
        if (!specifier) {
            continue;
        }
        if (specifier.endsWith('.css')) {
            cssImportSpecifiers.add(specifier);
        }
        if (isExternalRuntimeSpecifier(specifier)) {
            externalImportSpecifiers.add(specifier);
        }
    }

    return {
        componentHoistIds: Object.keys(envelope.ir.components_scripts || {}).sort(),
        cssImportSpecifiers: [...cssImportSpecifiers].sort(),
        externalImportSpecifiers: [...externalImportSpecifiers].sort()
    };
}

function buildPageOnlyFastPathSignature(envelope) {
    return stableJson({
        route: envelope.route,
        router: envelope.router === true,
        assetContract: collectEnvelopeAssetContract(envelope),
        styleBlocks: envelope.ir.style_blocks || [],
        serverScript: envelope.ir.server_script || null,
        prerender: envelope.ir.prerender === true,
        hasGuard: envelope.ir.has_guard === true,
        hasLoad: envelope.ir.has_load === true,
        guardModuleRef: envelope.ir.guard_module_ref || null,
        loadModuleRef: envelope.ir.load_module_ref || null
    });
}

function buildGlobalGraphHash(envelopes) {
    const nodesByHoistId = new Map();
    const edgeSet = new Set();
    for (const envelope of envelopes) {
        for (const node of envelope.ir.graph_nodes || []) {
            if (node && typeof node.hoist_id === 'string' && node.hoist_id.length > 0) {
                nodesByHoistId.set(node.hoist_id, true);
            }
        }
        for (const edge of envelope.ir.graph_edges || []) {
            if (typeof edge === 'string' && edge.length > 0) {
                edgeSet.add(edge);
            }
        }
    }

    let seed = '';
    for (const hoistId of [...nodesByHoistId.keys()].sort()) {
        seed += `node:${hoistId}\n`;
    }
    for (const edge of [...edgeSet].sort()) {
        seed += `edge:${edge}\n`;
    }
    return createHash('sha256').update(seed).digest('hex');
}

function selectPageOnlyEntries(changedFiles, pagesDir, manifestEntryByPath) {
    if (changedFiles.length === 0) {
        return [];
    }

    const selected = new Map();
    for (const filePath of changedFiles) {
        const resolvedPath = resolve(filePath);
        if (!resolvedPath.startsWith(pagesDir) || !resolvedPath.endsWith('.zen') || !existsSync(resolvedPath)) {
            return [];
        }
        const entry = manifestEntryByPath.get(resolvedPath);
        if (!entry) {
            return [];
        }
        selected.set(entry.file, entry);
    }

    return [...selected.values()];
}

async function maybeRunVersionCheck({
    state,
    startupProfile,
    projectRoot,
    logger,
    bundlerBin
}) {
    if (state.versionChecked) {
        return;
    }

    const resolvedBundlerCandidate = getActiveToolchainCandidate(bundlerBin);
    await startupProfile.measureAsync('version_mismatch_check', () => maybeWarnAboutZenithVersionMismatch({
        projectRoot,
        logger,
        command: 'dev',
        bundlerBinPath: resolvedBundlerCandidate?.path || resolveBundlerBin(projectRoot)
    }));
    state.versionChecked = true;
}

function buildCompilerWarningEmitter(logger) {
    return createCompilerWarningEmitter((line) => {
        if (logger && typeof logger.warn === 'function') {
            logger.warn(line, { onceKey: `compiler-warning:${line}` });
            return;
        }
        console.warn(line);
    });
}

export function createDevBuildSession(options) {
    const { pagesDir, outDir, config = {}, logger = null } = options;
    const resolvedPagesDir = resolve(pagesDir);
    const projectRoot = deriveProjectRootFromPagesDir(resolvedPagesDir);
    const srcDir = resolve(resolvedPagesDir, '..');
    const compilerBin = createCompilerToolchain({ projectRoot, logger });
    const bundlerBin = createBundlerToolchain({ projectRoot, logger });
    const softNavigationEnabled = config.softNavigation === true || config.router === true;
    const compilerOpts = {
        typescriptDefault: config.typescriptDefault === true,
        experimentalEmbeddedMarkup: config.embeddedMarkupExpressions === true
            || config.experimental?.embeddedMarkupExpressions === true,
        strictDomLints: config.strictDomLints === true
    };

    ensureToolchainCompatibility(bundlerBin);

    const state = {
        versionChecked: false,
        registry: new Map(),
        manifest: [],
        manifestEntryByPath: new Map(),
        envelopeByFile: new Map(),
        pageOnlyFastPathSignatureByFile: new Map(),
        globalGraphHash: '',
        pageLoopCaches: createPageLoopCaches(),
        hasSuccessfulBuild: false,
        imageManifest: {},
        imageRuntimePayload: createImageRuntimePayload(config.images, {}, 'endpoint')
    };

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
        state.imageRuntimePayload = createImageRuntimePayload(config.images, manifest, 'endpoint');
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
                    devStableAssets: true,
                    rebuildStrategy: bundlerOptions.rebuildStrategy || 'full',
                    changedRoutes: bundlerOptions.changedRoutes || [],
                    fastPath: bundlerOptions.fastPath === true,
                    globalGraphHash: bundlerOptions.globalGraphHash || ''
                }
            ),
            { envelopes: orderedEnvelopes.length }
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
            softNavigationEnabled,
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
            softNavigationEnabled,
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
