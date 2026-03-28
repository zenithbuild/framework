import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { applyOccurrenceRewritePlans } from '../component-instance-ir.js';
import { collectExpandedComponentOccurrences } from '../component-occurrences.js';
import { expandComponents } from '../resolve-components.js';
import { composeServerScriptEnvelope, resolveAdjacentServerModules } from '../server-script-composition.js';
import { createTimedCompilerRunner, mergePageImageMaterialization } from './compiler-runtime.js';
import {
    buildComponentExpressionRewrite,
    mergeExpressionRewriteMaps,
    resolveRewrittenBindingMetadata
} from './expression-rewrites.js';
import { createPageIrMergeCache } from './merge-component-ir.js';
import { buildPageOwnerContext, runPageComponentLoop } from './page-component-loop.js';
import {
    applyExpressionRewrites,
    normalizeExpressionPayload,
    normalizeHoistedSourcePayload,
    rewriteLegacyMarkupIdentifiers,
    rewriteRefBindingIdentifiers
} from './page-ir-normalization.js';
import { deferComponentRuntimeBlock } from './hoisted-code-transforms.js';
import {
    addBreakdown,
    emitPageLoopSummary,
    recordPageProfile
} from './page-loop-metrics.js';
import {
    applyServerEnvelopeToPageIr,
    buildOccurrenceCountByPath,
    createPageBuildState,
    createPageLoopCaches,
    createPageLoopExecutionState
} from './page-loop-state.js';
import { extractServerScript } from './server-script.js';

/**
 * @param {{
 *   manifest: Array<{ path: string, file: string }>
 *   pagesDir: string
 *   srcDir: string
 *   registry: Map<string, string>
 *   compilerOpts: object
 *   compilerBin: string|object
 *   routerEnabled: boolean
 *   startupProfile: ReturnType<import('../startup-profile.js').createStartupProfiler>
 *   compilerTotals: Record<string, number>
 *   emitCompilerWarning: (line: string) => void
 * }} input
 * @returns {Promise<{ envelopes: object[], expressionRewriteMetrics: Record<string, number> }>}
 */
export async function buildPageEnvelopes(input) {
    const {
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
    } = input;

    const cacheState = input.pageLoopCaches || createPageLoopCaches();
    const executionState = createPageLoopExecutionState();

    const {
        componentIrCache,
        componentDocumentModeCache,
        componentExpressionRewriteCache,
        hoistedCodeTransformCache
    } = cacheState;
    const {
        expressionRewriteMetrics,
        pagePhaseTotals,
        occurrenceApplyPhaseTotals,
        bindingResolutionTotals,
        scopedRewritePhaseTotals,
        mergePhaseTotals,
        componentLoopPhaseTotals,
        pageProfiles,
        envelopes
    } = executionState;

    async function cooperativeYield() {
        await new Promise((resolve) => setImmediate(resolve));
    }
    const timedRunCompiler = createTimedCompilerRunner(startupProfile, compilerTotals);

    const pageLoopStartedAt = performance.now();
    for (const entry of manifest) {
        const pageStartedAt = performance.now();
        let {
            pagePhase,
            pageOccurrenceApplyBreakdown,
            pageBindingResolutionBreakdown,
            pageScopedRewriteBreakdown,
            pageMergeBreakdown,
            pageComponentLoopBreakdown,
            pageExpandMs,
            pageCompileMs,
            pageOwnerCompileMs,
            pageComponentCompileMs,
            pageComponentCacheHits,
            pageComponentCacheMisses
        } = createPageBuildState();
        await cooperativeYield();
        const sourceFile = join(pagesDir, entry.file);
        const rawSource = readFileSync(sourceFile, 'utf8');
        const occurrenceCollectStartedAt = performance.now();
        const componentOccurrences = collectExpandedComponentOccurrences(rawSource, registry, sourceFile);
        pagePhase.occurrenceCollectMs = startupProfile.roundMs(performance.now() - occurrenceCollectStartedAt);

        const pageOwnerExtractStartedAt = performance.now();
        const pageOwnerSource = extractServerScript(rawSource, sourceFile, compilerOpts).source;
        pagePhase.serverExtractMs += startupProfile.roundMs(performance.now() - pageOwnerExtractStartedAt);

        const {
            guardPath: adjacentGuard,
            loadPath: adjacentLoad,
            actionPath: adjacentAction
        } = resolveAdjacentServerModules(sourceFile);
        const expandedStartedAt = performance.now();
        const { expandedSource } = expandComponents(rawSource, registry, sourceFile);
        pageExpandMs = startupProfile.roundMs(performance.now() - expandedStartedAt);

        const expandedServerExtractStartedAt = performance.now();
        const extractedServer = extractServerScript(expandedSource, sourceFile, compilerOpts);
        pagePhase.serverExtractMs += startupProfile.roundMs(performance.now() - expandedServerExtractStartedAt);
        const compileSource = extractedServer.source;

        await cooperativeYield();
        const pageCompileStartedAt = performance.now();
        let pageIr = timedRunCompiler(
            'page',
            sourceFile,
            compileSource,
            compilerOpts,
            { compilerToolchain: compilerBin, onWarning: emitCompilerWarning }
        );
        pageCompileMs = startupProfile.roundMs(performance.now() - pageCompileStartedAt);

        const composedServer = composeServerScriptEnvelope({
            sourceFile,
            inlineServerScript: extractedServer.serverScript,
            adjacentGuardPath: adjacentGuard,
            adjacentLoadPath: adjacentLoad,
            adjacentActionPath: adjacentAction
        });
        const hasGuard = composedServer.serverScript?.has_guard === true;
        const hasLoad = composedServer.serverScript?.has_load === true;
        const hasAction = composedServer.serverScript?.has_action === true;

        applyServerEnvelopeToPageIr({
            pageIr,
            composedServer,
            hasGuard,
            hasLoad,
            hasAction,
            entry,
            srcDir,
            sourceFile
        });

        const pageIrMergeCache = createPageIrMergeCache(pageIr);
        const seenStaticImports = new Set();
        const occurrenceCountByPath = buildOccurrenceCountByPath(componentOccurrences);

        const pageExpressionRewriteMap = new Map();
        const pageExpressionBindingMap = new Map();
        const pageAmbiguousExpressionMap = new Set();
        const knownRefKeys = new Set();
        const componentOccurrencePlans = [];
        const imagePropsLiterals = [];
        const {
            pageOwnerCompileMs: resolvedPageOwnerCompileMs,
            pageOwnerExpressionRewrite
        } = await buildPageOwnerContext({
            componentOccurrences,
            sourceFile,
            pageOwnerSource,
            compilerOpts,
            compilerBin,
            timedRunCompiler,
            cooperativeYield,
            expressionRewriteMetrics,
            startupProfile
        });
        pageOwnerCompileMs = resolvedPageOwnerCompileMs;
        const pageSelfRewriteStartedAt = performance.now();
        const pageSelfExpressionRewrite = buildComponentExpressionRewrite(
            pageIr,
            expressionRewriteMetrics
        );
        pagePhase.selfRewriteMs = startupProfile.roundMs(performance.now() - pageSelfRewriteStartedAt);
        mergeExpressionRewriteMaps(
            pageExpressionRewriteMap,
            pageExpressionBindingMap,
            pageAmbiguousExpressionMap,
            pageSelfExpressionRewrite,
            pageIrMergeCache,
            pageBindingResolutionBreakdown
        );
        const componentLoopStartedAt = performance.now();
        const pageStats = {
            pageComponentCompileMs,
            pageComponentCacheHits,
            pageComponentCacheMisses
        };
        await runPageComponentLoop({
            componentOccurrences,
            occurrenceCountByPath,
            sourceFile,
            registry,
            compilerOpts,
            compilerBin,
            timedRunCompiler,
            cooperativeYield,
            startupProfile,
            compilerTotals,
            emitCompilerWarning,
            componentIrCache,
            componentDocumentModeCache,
            componentExpressionRewriteCache,
            expressionRewriteMetrics,
            pageOwnerExpressionRewrite,
            pageIr,
            pageIrMergeCache,
            seenStaticImports,
            pageExpressionRewriteMap,
            pageExpressionBindingMap,
            pageAmbiguousExpressionMap,
            knownRefKeys,
            componentOccurrencePlans,
            imagePropsLiterals,
            pagePhase,
            pageBindingResolutionBreakdown,
            pageMergeBreakdown,
            pageComponentLoopBreakdown,
            hoistedCodeTransformCache,
            pageStats
        });
        pageComponentCompileMs = pageStats.pageComponentCompileMs;
        pageComponentCacheHits = pageStats.pageComponentCacheHits;
        pageComponentCacheMisses = pageStats.pageComponentCacheMisses;

        pagePhase.componentLoopMs = startupProfile.roundMs(performance.now() - componentLoopStartedAt);

        if (imagePropsLiterals.length > 0) {
            pageIr = mergePageImageMaterialization(pageIr, imagePropsLiterals, {
                compilerToolchain: compilerBin
            });
        }

        const occurrencePlanApplyStartedAt = performance.now();
        applyOccurrenceRewritePlans(
            pageIr,
            componentOccurrencePlans,
            (rewrite, binding) => resolveRewrittenBindingMetadata(
                pageIrMergeCache,
                rewrite,
                binding,
                pageBindingResolutionBreakdown
            ),
            pageOccurrenceApplyBreakdown
        );
        pagePhase.occurrencePlanApplyMs = startupProfile.roundMs(performance.now() - occurrencePlanApplyStartedAt);
        const expressionApplyStartedAt = performance.now();
        applyExpressionRewrites(pageIr, pageExpressionRewriteMap, pageExpressionBindingMap, pageAmbiguousExpressionMap);
        pagePhase.expressionApplyMs = startupProfile.roundMs(performance.now() - expressionApplyStartedAt);
        const normalizeStartedAt = performance.now();
        normalizeExpressionPayload(pageIr);
        normalizeHoistedSourcePayload(pageIr);
        if (Array.isArray(pageIr?.hoisted?.code) && pageIr.hoisted.code.length > 0) {
            pageIr.hoisted.code = pageIr.hoisted.code
                .map((entry) => deferComponentRuntimeBlock(entry, hoistedCodeTransformCache, expressionRewriteMetrics))
                .filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
        }
        rewriteLegacyMarkupIdentifiers(pageIr);
        rewriteRefBindingIdentifiers(pageIr, knownRefKeys);
        pagePhase.normalizeMs = startupProfile.roundMs(performance.now() - normalizeStartedAt);

        addBreakdown(pagePhaseTotals, pagePhase);
        addBreakdown(occurrenceApplyPhaseTotals, pageOccurrenceApplyBreakdown);
        addBreakdown(bindingResolutionTotals, pageBindingResolutionBreakdown);
        addBreakdown(scopedRewritePhaseTotals, pageScopedRewriteBreakdown);
        addBreakdown(mergePhaseTotals, pageMergeBreakdown);
        addBreakdown(componentLoopPhaseTotals, pageComponentLoopBreakdown);
        envelopes.push({
            route: entry.path,
            file: sourceFile,
            ir: pageIr,
            image_materialization: Array.isArray(pageIr.image_materialization)
                ? pageIr.image_materialization
                : [],
            router: routerEnabled
        });
        recordPageProfile({
            pageProfiles,
            entry,
            componentOccurrences: componentOccurrences.length,
            pageExpandMs,
            pageCompileMs,
            pageOwnerCompileMs,
            pageComponentCompileMs,
            pageComponentCacheHits,
            pageComponentCacheMisses,
            pagePhase,
            startupProfile,
            pageStartedAt
        });
    }

    emitPageLoopSummary({
        startupProfile,
        manifest,
        pageLoopStartedAt,
        compilerTotals,
        expressionRewriteMetrics,
        pagePhaseTotals,
        occurrenceApplyPhaseTotals,
        bindingResolutionTotals,
        scopedRewritePhaseTotals,
        mergePhaseTotals,
        componentLoopPhaseTotals,
        pageProfiles
    });

    return { envelopes, expressionRewriteMetrics };
}
