import { performance } from 'node:perf_hooks';

export function createPagePhaseTotals() {
    return {
        occurrenceCollectMs: 0,
        serverExtractMs: 0,
        selfRewriteMs: 0,
        componentLoopMs: 0,
        cloneMs: 0,
        instanceRewriteMs: 0,
        mergeMs: 0,
        occurrencePlanApplyMs: 0,
        expressionApplyMs: 0,
        scopedRewritePlanMs: 0,
        scopedRewriteApplyMs: 0,
        scopedRewriteMs: 0,
        normalizeMs: 0
    };
}

export function createMergePhaseTotals() {
    return {
        componentScriptsMs: 0,
        componentInstancesMs: 0,
        refBindingsMs: 0,
        importsMs: 0,
        hoistedSymbolsMs: 0,
        runtimeSignalsMs: 0,
        hoistedCodeMs: 0,
        codeRebaseImportsMs: 0,
        codeFilterImportsMs: 0,
        codePropsPreludeMs: 0,
        codeTranspileMs: 0,
        codeTranspileCacheHits: 0,
        codeTranspileCacheMisses: 0,
        codeTranspileExactNoopCount: 0,
        codeTranspileTrimmedNoopCount: 0,
        codeTranspileChangedOutputCount: 0,
        codeDedupeImportsMs: 0,
        codeDeferRuntimeMs: 0,
        codeDeferRuntimeCacheHits: 0,
        codeDeferRuntimeCacheMisses: 0
    };
}

export function createComponentLoopPhaseTotals() {
    return {
        componentSourceReadMs: 0,
        ownerSourceReadMs: 0,
        componentDocModeDetectMs: 0,
        componentExpressionRewriteBuildMs: 0,
        ownerExpressionRewriteBuildMs: 0,
        ownerScopeRewriteBuildMs: 0
    };
}

export function createOccurrenceApplyPhaseTotals() {
    return {
        queueBuildMs: 0,
        expressionLookupMs: 0,
        refLookupMs: 0,
        bindingResolutionMs: 0
    };
}

export function createBindingResolutionTotals() {
    return {
        pageMapConstructionMs: 0,
        compiledSignalRemapMs: 0,
        fallbackSignalStateLookupMs: 0
    };
}

export function createScopedRewritePhaseTotals() {
    return {
        totalValues: 0,
        cacheHitCount: 0,
        cacheMissCount: 0,
        cacheMissMs: 0,
        identifierCheckMs: 0,
        fastSkipCount: 0,
        fastSkipMs: 0,
        rewriteCallMs: 0,
        changedMissCount: 0,
        unchangedMissCount: 0
    };
}

export function addBreakdown(target, source) {
    for (const [key, value] of Object.entries(source)) {
        target[key] += value;
    }
}

export function roundBreakdown(startupProfile, value) {
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, startupProfile.roundMs(item)])
    );
}

export function recordPageProfile({
    pageProfiles,
    entry,
    componentOccurrences,
    pageExpandMs,
    pageCompileMs,
    pageOwnerCompileMs,
    pageComponentCompileMs,
    pageComponentCacheHits,
    pageComponentCacheMisses,
    pagePhase,
    startupProfile,
    pageStartedAt
}) {
    pageProfiles.push({
        route: entry.path,
        file: entry.file,
        componentOccurrences,
        expandMs: pageExpandMs,
        pageCompileMs,
        ownerCompileMs: pageOwnerCompileMs,
        componentCompileMs: startupProfile.roundMs(pageComponentCompileMs),
        componentCacheHits: pageComponentCacheHits,
        componentCacheMisses: pageComponentCacheMisses,
        occurrenceCollectMs: pagePhase.occurrenceCollectMs,
        serverExtractMs: pagePhase.serverExtractMs,
        selfRewriteMs: pagePhase.selfRewriteMs,
        componentLoopMs: pagePhase.componentLoopMs,
        cloneMs: startupProfile.roundMs(pagePhase.cloneMs),
        instanceRewriteMs: startupProfile.roundMs(pagePhase.instanceRewriteMs),
        mergeMs: startupProfile.roundMs(pagePhase.mergeMs),
        occurrencePlanApplyMs: pagePhase.occurrencePlanApplyMs,
        expressionApplyMs: pagePhase.expressionApplyMs,
        scopedRewritePlanMs: pagePhase.scopedRewritePlanMs,
        scopedRewriteApplyMs: pagePhase.scopedRewriteApplyMs,
        scopedRewriteMs: pagePhase.scopedRewriteMs,
        normalizeMs: pagePhase.normalizeMs,
        totalMs: startupProfile.roundMs(performance.now() - pageStartedAt)
    });
}

export function emitPageLoopSummary({
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
}) {
    startupProfile.emit('page_loop_summary', {
        manifestPages: manifest.length,
        totalMs: startupProfile.roundMs(performance.now() - pageLoopStartedAt),
        compilerTotals,
        expressionRewriteMetrics,
        pagePhaseTotals: roundBreakdown(startupProfile, pagePhaseTotals),
        occurrenceApplyPhaseTotals: roundBreakdown(startupProfile, occurrenceApplyPhaseTotals),
        bindingResolutionTotals: roundBreakdown(startupProfile, bindingResolutionTotals),
        scopedRewritePhaseTotals: roundBreakdown(startupProfile, scopedRewritePhaseTotals),
        mergePhaseTotals: roundBreakdown(startupProfile, mergePhaseTotals),
        componentLoopPhaseTotals: roundBreakdown(startupProfile, componentLoopPhaseTotals),
        slowestPages: [...pageProfiles].sort((left, right) => right.totalMs - left.totalMs).slice(0, 5)
    });
}
