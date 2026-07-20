import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { cloneComponentIrForInstance } from '../component-instance-ir.js';
import { renderPropsLiteralFromAttrs } from './scoped-identifier-rewrite.js';
import { extractTemplate, isDocumentMode } from '../resolve-components.js';
import {
    buildComponentExpressionRewrite,
    mergeExpressionRewriteMaps,
    resolveStateKeyFromBindings
} from './expression-rewrites.js';
import {
    applyScopedDataContextToExpressionRewrite,
    resolveScopedExpressionContext
} from './scoped-expression-context.js';
import { mergeComponentIr } from './merge-component-ir.js';
import { stripStyleBlocks } from './compiler-runtime.js';
import { extractDeclaredIdentifiers } from './typescript-expression-utils.js';
import { createSourceImportRecords } from './relative-helper-modules.js';

function createEmptyExpressionRewrite() {
    return {
        map: new Map(),
        bindings: new Map(),
        signals: [],
        stateBindings: [],
        ambiguous: new Set(),
        sequence: []
    };
}

const SERVER_CONST_RE = /(?:^|\n)\s*const\s+([A-Za-z_$][\w$]*)\s*=/g;

function stripOwnerServerBlocks(source) {
    return String(source || '').replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs) => {
        if (/\bserver\b/i.test(String(attrs || ''))) {
            return '';
        }
        return full;
    });
}

function collectServerConstNames(source) {
    const names = [];
    for (const match of String(source || '').matchAll(SERVER_CONST_RE)) {
        const name = String(match[1] || '');
        if (name && !names.includes(name)) {
            names.push(name);
        }
    }
    return names;
}

function createClientPlaceholderPrelude(source, strippedSource) {
    const names = [];
    String(source || '').replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, body) => {
        if (/\bserver\b/i.test(String(attrs || ''))) {
            for (const name of collectServerConstNames(body)) {
                const refRe = new RegExp(`\\b${escapeRegExp(name)}\\b`);
                if (refRe.test(strippedSource) && !names.includes(name)) {
                    names.push(name);
                }
            }
        }
        return full;
    });
    if (names.length === 0) {
        return '';
    }
    return [
        '<script lang="ts">',
        ...names.map((name) => `const ${name} = undefined;`),
        '</script>',
        ''
    ].join('\n');
}

function prepareOwnerClientCompileSource(source) {
    const strippedSource = stripOwnerServerBlocks(source);
    return stripStyleBlocks(`${createClientPlaceholderPrelude(source, strippedSource)}${strippedSource}`);
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureImportRecords(ir, path, srcDir) {
    if (ir && !ir.import_records) ir.import_records = createSourceImportRecords(ir.hoisted?.imports || [], path, srcDir);
}

async function resolveComponentIr({
    compPath,
    componentSource,
    srcDir,
    compilerOpts,
    compilerBin,
    timedRunCompiler,
    cooperativeYield,
    componentIrCache,
    compilerTotals,
    pageStats,
    startupProfile,
    emitCompilerWarning
}) {
    let compIr;
    if (componentIrCache.has(compPath)) {
        compIr = componentIrCache.get(compPath);
        compilerTotals.componentCacheHits += 1;
        pageStats.pageComponentCacheHits += 1;
    } else {
        await cooperativeYield();
        const componentCompileStartedAt = performance.now();
        compIr = timedRunCompiler(
            'component',
            compPath,
            prepareOwnerClientCompileSource(componentSource),
            compilerOpts,
            { compilerToolchain: compilerBin, onWarning: emitCompilerWarning }
        );
        pageStats.pageComponentCompileMs += startupProfile.roundMs(performance.now() - componentCompileStartedAt);
        compilerTotals.componentCacheMisses += 1;
        pageStats.pageComponentCacheMisses += 1;
        componentIrCache.set(compPath, compIr);
    }

    ensureImportRecords(compIr, compPath, srcDir || compilerOpts?.srcDir || '');

    return compIr;
}

function resolveDocumentMode({
    compPath,
    componentSource,
    componentDocumentModeCache,
    pageComponentLoopBreakdown,
    startupProfile
}) {
    let docMode = componentDocumentModeCache.get(compPath);
    if (docMode === undefined) {
        const componentDocModeStartedAt = performance.now();
        docMode = isDocumentMode(extractTemplate(componentSource));
        pageComponentLoopBreakdown.componentDocModeDetectMs += startupProfile.roundMs(
            performance.now() - componentDocModeStartedAt
        );
        componentDocumentModeCache.set(compPath, docMode);
    }
    return docMode;
}

function resolveComponentExpressionRewrite({
    compPath,
    compIr,
    expressionRewriteMetrics,
    componentExpressionRewriteCache,
    pageComponentLoopBreakdown,
    startupProfile
}) {
    let expressionRewrite = componentExpressionRewriteCache.get(compPath);
    if (!expressionRewrite) {
        const startedAt = performance.now();
        expressionRewrite = buildComponentExpressionRewrite(compIr, expressionRewriteMetrics);
        pageComponentLoopBreakdown.componentExpressionRewriteBuildMs += startupProfile.roundMs(
            performance.now() - startedAt
        );
        componentExpressionRewriteCache.set(compPath, expressionRewrite);
    }
    return expressionRewrite;
}

async function resolveOwnerRewriteContext({
    occurrence,
    sourceFile,
    srcDir,
    compilerOpts,
    compilerBin,
    timedRunCompiler,
    cooperativeYield,
    componentIrCache,
    componentExpressionRewriteCache,
    expressionRewriteMetrics,
    startupProfile,
    compilerTotals,
    emitCompilerWarning,
    pageComponentLoopBreakdown,
    pageStats,
    pageOwnerExpressionRewrite
}) {
    const ownerPath = typeof occurrence.ownerPath === 'string' && occurrence.ownerPath.length > 0
        ? occurrence.ownerPath
        : sourceFile;

    if (ownerPath === sourceFile) {
        return {
            attrExpressionRewrite: pageOwnerExpressionRewrite
        };
    }

    let ownerIr = componentIrCache.get(ownerPath);
    let ownerSource = null;

    if (!ownerIr) {
        const ownerSourceReadStartedAt = performance.now();
        ownerSource = readFileSync(ownerPath, 'utf8');
        pageComponentLoopBreakdown.ownerSourceReadMs += startupProfile.roundMs(
            performance.now() - ownerSourceReadStartedAt
        );
        await cooperativeYield();
        const ownerCompileStartedAt = performance.now();
        ownerIr = timedRunCompiler(
            'component',
            ownerPath,
            prepareOwnerClientCompileSource(ownerSource),
            compilerOpts,
            { compilerToolchain: compilerBin, onWarning: emitCompilerWarning }
        );
        pageStats.pageComponentCompileMs += startupProfile.roundMs(performance.now() - ownerCompileStartedAt);
        compilerTotals.componentCacheMisses += 1;
        pageStats.pageComponentCacheMisses += 1;
        componentIrCache.set(ownerPath, ownerIr);
    } else {
        compilerTotals.componentCacheHits += 1;
        pageStats.pageComponentCacheHits += 1;
    }

    ensureImportRecords(ownerIr, ownerPath, srcDir || compilerOpts?.srcDir || '');

    let attrExpressionRewrite = componentExpressionRewriteCache.get(ownerPath);
    if (!attrExpressionRewrite) {
        if (!ownerSource) {
            const ownerSourceReadStartedAt = performance.now();
            ownerSource = readFileSync(ownerPath, 'utf8');
            pageComponentLoopBreakdown.ownerSourceReadMs += startupProfile.roundMs(
                performance.now() - ownerSourceReadStartedAt
            );
        }
        const startedAt = performance.now();
        attrExpressionRewrite = buildComponentExpressionRewrite(ownerIr, expressionRewriteMetrics);
        pageComponentLoopBreakdown.ownerExpressionRewriteBuildMs += startupProfile.roundMs(
            performance.now() - startedAt
        );
        componentExpressionRewriteCache.set(ownerPath, attrExpressionRewrite);
    }

    return { attrExpressionRewrite };
}

function resolveInstanceState({
    useIsolatedInstance,
    compIr,
    expressionRewriteMetrics,
    expressionRewrite,
    startupProfile,
    pagePhase,
    componentInstanceCounter
}) {
    if (!useIsolatedInstance) {
        return {
            instanceIr: compIr,
            refIdentifierPairs: [],
            instanceRewrite: expressionRewrite,
            componentInstanceCounter
        };
    }

    const cloneStartedAt = performance.now();
    const cloned = cloneComponentIrForInstance(
        compIr,
        componentInstanceCounter,
        extractDeclaredIdentifiers,
        resolveStateKeyFromBindings
    );
    pagePhase.cloneMs += startupProfile.roundMs(performance.now() - cloneStartedAt);

    const instanceRewriteStartedAt = performance.now();
    const instanceRewrite = buildComponentExpressionRewrite(cloned.ir, expressionRewriteMetrics);
    pagePhase.instanceRewriteMs += startupProfile.roundMs(performance.now() - instanceRewriteStartedAt);

    return {
        instanceIr: cloned.ir,
        refIdentifierPairs: cloned.refIdentifierPairs,
        instanceRewrite,
        componentInstanceCounter: componentInstanceCounter + 1
    };
}

export async function buildPageOwnerContext({
    componentOccurrences,
    sourceFile,
    pageOwnerSource,
    compilerOpts,
    compilerBin,
    timedRunCompiler,
    cooperativeYield,
    expressionRewriteMetrics,
    startupProfile
}) {
    if (componentOccurrences.length === 0) {
        return {
            pageOwnerCompileMs: 0,
            pageOwnerExpressionRewrite: createEmptyExpressionRewrite()
        };
    }

    await cooperativeYield();
    const ownerStartedAt = performance.now();
    const pageOwnerIr = timedRunCompiler(
        'owner',
        sourceFile,
        pageOwnerSource,
        compilerOpts,
        { suppressWarnings: true, compilerToolchain: compilerBin }
    );
    const pageOwnerCompileMs = startupProfile.roundMs(performance.now() - ownerStartedAt);

    return {
        pageOwnerCompileMs,
        pageOwnerExpressionRewrite: buildComponentExpressionRewrite(pageOwnerIr, expressionRewriteMetrics)
    };
}

export async function runPageComponentLoop({
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
    pageStats,
    srcDir
}) {
    let componentInstanceCounter = 0;
    const scopedOccurrenceIndexByOwnerKey = new Map();
    for (const occurrence of componentOccurrences) {
        await cooperativeYield();
        const compName = occurrence.name;
        const compPath = occurrence.componentPath || registry.get(compName);
        if (!compPath) {
            continue;
        }

        const componentSourceReadStartedAt = performance.now();
        const componentSource = readFileSync(compPath, 'utf8');
        pageComponentLoopBreakdown.componentSourceReadMs += startupProfile.roundMs(
            performance.now() - componentSourceReadStartedAt
        );
        const occurrenceCount = occurrenceCountByPath.get(compPath)
            || occurrenceCountByPath.get(compName)
            || 0;

        const compIr = await resolveComponentIr({
            compPath,
            componentSource,
            srcDir,
            compilerOpts,
            compilerBin,
            timedRunCompiler,
            cooperativeYield,
            componentIrCache,
            compilerTotals,
            pageStats,
            startupProfile,
            emitCompilerWarning
        });
        const isDocMode = resolveDocumentMode({
            compPath,
            componentSource,
            componentDocumentModeCache,
            pageComponentLoopBreakdown,
            startupProfile
        });
        const expressionRewrite = resolveComponentExpressionRewrite({
            compPath,
            compIr,
            expressionRewriteMetrics,
            componentExpressionRewriteCache,
            pageComponentLoopBreakdown,
            startupProfile
        });
        const scopedContext = resolveScopedExpressionContext(pageIr, compPath, scopedOccurrenceIndexByOwnerKey);
        const scopedExpressionRewrite = scopedContext
            ? applyScopedDataContextToExpressionRewrite(expressionRewrite, scopedContext)
            : expressionRewrite;
        const { attrExpressionRewrite } = await resolveOwnerRewriteContext({
            occurrence,
            sourceFile,
            srcDir,
            compilerOpts,
            compilerBin,
            timedRunCompiler,
            cooperativeYield,
            componentIrCache,
            componentExpressionRewriteCache,
            expressionRewriteMetrics,
            startupProfile,
            compilerTotals,
            emitCompilerWarning,
            pageComponentLoopBreakdown,
            pageStats,
            pageOwnerExpressionRewrite
        });
        if (compName === 'Image') {
            imagePropsLiterals.push(
                renderPropsLiteralFromAttrs(occurrence.attrs || '', {
                    expressionRewrite: attrExpressionRewrite
                })
            );
        }

        const useIsolatedInstance = occurrenceCount > 1;
        const instanceState = resolveInstanceState({
            useIsolatedInstance,
            compIr,
            expressionRewriteMetrics,
            expressionRewrite,
            startupProfile,
            pagePhase,
            componentInstanceCounter
        });
        componentInstanceCounter = instanceState.componentInstanceCounter;

        const mergeStartedAt = performance.now();
        mergeComponentIr(
            pageIr,
            instanceState.instanceIr,
            compPath,
            sourceFile,
            {
                includeCode: true,
                cssImportsOnly: isDocMode,
                documentMode: isDocMode,
                componentAttrs: typeof occurrence.attrs === 'string' ? occurrence.attrs : '',
                componentAttrsRewrite: {
                    expressionRewrite: attrExpressionRewrite
                },
                srcDir
            },
            seenStaticImports,
            knownRefKeys,
            pageIrMergeCache,
            pageMergeBreakdown,
            hoistedCodeTransformCache
        );
        pagePhase.mergeMs += startupProfile.roundMs(performance.now() - mergeStartedAt);

        if (useIsolatedInstance) {
            const scopedInstanceRewrite = scopedContext
                ? applyScopedDataContextToExpressionRewrite(instanceState.instanceRewrite, scopedContext)
                : instanceState.instanceRewrite;
            componentOccurrencePlans.push({
                rewrite: scopedInstanceRewrite,
                expressionSequence: scopedInstanceRewrite.sequence,
                refSequence: instanceState.refIdentifierPairs
            });
            continue;
        }

        mergeExpressionRewriteMaps(
            pageExpressionRewriteMap,
            pageExpressionBindingMap,
            pageAmbiguousExpressionMap,
            scopedExpressionRewrite,
            pageIrMergeCache,
            pageBindingResolutionBreakdown
        );

        componentOccurrencePlans.push({
            rewrite: scopedExpressionRewrite,
            expressionSequence: scopedExpressionRewrite.sequence,
            refSequence: instanceState.refIdentifierPairs
        });
    }
}
