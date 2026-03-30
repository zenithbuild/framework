import { relative } from 'node:path';

import {
    createBindingResolutionTotals,
    createComponentLoopPhaseTotals,
    createMergePhaseTotals,
    createOccurrenceApplyPhaseTotals,
    createPagePhaseTotals,
    createScopedRewritePhaseTotals
} from './page-loop-metrics.js';

export function createPageLoopState() {
    return {
        ...createPageLoopCaches(),
        ...createPageLoopExecutionState()
    };
}

export function createPageLoopCaches() {
    return {
        componentIrCache: new Map(),
        componentDocumentModeCache: new Map(),
        componentExpressionRewriteCache: new Map(),
        hoistedCodeTransformCache: {
            transpileToJs: new Map(),
            deferRuntime: new Map()
        }
    };
}

export function createPageLoopExecutionState() {
    return {
        expressionRewriteMetrics: {
            calls: 0,
            compilerOwnedBindings: 0,
            ambiguousBindings: 0
        },
        pagePhaseTotals: createPagePhaseTotals(),
        occurrenceApplyPhaseTotals: createOccurrenceApplyPhaseTotals(),
        bindingResolutionTotals: createBindingResolutionTotals(),
        scopedRewritePhaseTotals: createScopedRewritePhaseTotals(),
        mergePhaseTotals: createMergePhaseTotals(),
        componentLoopPhaseTotals: createComponentLoopPhaseTotals(),
        pageProfiles: [],
        envelopes: []
    };
}

export function preparePageIrForMerge(pageIr) {
    pageIr.components_scripts = pageIr.components_scripts || {};
    pageIr.component_instances = pageIr.component_instances || [];
    pageIr.signals = Array.isArray(pageIr.signals) ? pageIr.signals : [];
    pageIr.hoisted = pageIr.hoisted || { imports: [], declarations: [], functions: [], signals: [], state: [], code: [] };
    pageIr.hoisted.imports = pageIr.hoisted.imports || [];
    pageIr.hoisted.declarations = pageIr.hoisted.declarations || [];
    pageIr.hoisted.functions = pageIr.hoisted.functions || [];
    pageIr.hoisted.signals = pageIr.hoisted.signals || [];
    pageIr.hoisted.state = pageIr.hoisted.state || [];
    pageIr.hoisted.code = pageIr.hoisted.code || [];
}

export function applyServerEnvelopeToPageIr({
    pageIr,
    composedServer,
    hasGuard,
    hasLoad,
    hasAction,
    entry,
    srcDir,
    sourceFile
}) {
    if (composedServer.serverScript) {
        const {
            has_action: _unusedHasAction,
            export_paths: _unusedExportPaths,
            ...serverScript
        } = composedServer.serverScript;
        pageIr.server_script = serverScript;
        pageIr.prerender = composedServer.serverScript.prerender === true;
        if (pageIr.ssr_data === undefined) {
            pageIr.ssr_data = null;
        }
    }

    if (pageIr.prerender === true && (hasGuard || hasLoad || hasAction)) {
        throw new Error(
            `[zenith] Build failed for ${entry.file}: protected routes require SSR/runtime. ` +
            'Cannot prerender a static route with a `guard`, `load`, or `action` function.'
        );
    }

    pageIr.has_guard = hasGuard;
    pageIr.has_load = hasLoad;
    pageIr.has_action = hasAction;
    pageIr.guard_module_ref = composedServer.guardPath ? relative(srcDir, composedServer.guardPath).replaceAll('\\', '/') : null;
    pageIr.load_module_ref = composedServer.loadPath ? relative(srcDir, composedServer.loadPath).replaceAll('\\', '/') : null;
    pageIr.action_module_ref = composedServer.actionPath ? relative(srcDir, composedServer.actionPath).replaceAll('\\', '/') : null;
    preparePageIrForMerge(pageIr);
}

export function buildOccurrenceCountByPath(componentOccurrences) {
    const occurrenceCountByPath = new Map();
    for (const occurrence of componentOccurrences) {
        const key = occurrence.componentPath || occurrence.name;
        occurrenceCountByPath.set(key, (occurrenceCountByPath.get(key) || 0) + 1);
    }
    return occurrenceCountByPath;
}

export function createPageBuildState() {
    return {
        pagePhase: createPagePhaseTotals(),
        pageOccurrenceApplyBreakdown: createOccurrenceApplyPhaseTotals(),
        pageBindingResolutionBreakdown: createBindingResolutionTotals(),
        pageScopedRewriteBreakdown: createScopedRewritePhaseTotals(),
        pageMergeBreakdown: createMergePhaseTotals(),
        pageComponentLoopBreakdown: createComponentLoopPhaseTotals(),
        pageExpandMs: 0,
        pageCompileMs: 0,
        pageOwnerCompileMs: 0,
        pageComponentCompileMs: 0,
        pageComponentCacheHits: 0,
        pageComponentCacheMisses: 0
    };
}
