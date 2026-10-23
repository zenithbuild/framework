import { relative } from 'node:path';

import { classifyPageRoute } from '../route-classification.js';
import { assertNoScopedServerBuildErrors } from '../manifest.js';
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
    entry,
    srcDir,
    sourceFile,
    scopedMetadata
}) {
    assertNoScopedServerBuildErrors(scopedMetadata.diagnostics, entry.file);

    const classification = classifyPageRoute({
        file: entry.file,
        serverScript: composedServer.serverScript,
        hasScopedServerData: scopedMetadata.hasScopedServerData
    });

    if (composedServer.serverScript) {
        const {
            has_action: _unusedHasAction,
            export_paths: _unusedExportPaths,
            ...serverScript
        } = composedServer.serverScript;
        pageIr.server_script = serverScript;
        pageIr.prerender = classification.prerender;
        if (pageIr.ssr_data === undefined) {
            pageIr.ssr_data = null;
        }
    }

    pageIr.has_guard = classification.hasGuard;
    pageIr.has_load = classification.hasLoad;
    pageIr.has_action = classification.hasAction;
    pageIr.has_scoped_server_data = scopedMetadata.hasScopedServerData;
    pageIr.scoped_server_data = scopedMetadata.hasScopedServerData
        ? scopedMetadata.scopedServerData
        : [];
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
