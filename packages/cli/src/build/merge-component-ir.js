import { performance } from 'node:perf_hooks';
import { resolveStateKeyFromBindings } from './expression-rewrites.js';
import { injectPropsPrelude } from './scoped-identifier-rewrite.js';
import {
    dedupeStaticImportsInSource,
    deferComponentRuntimeBlock,
    extractStaticImportSpecifier,
    isCssSpecifier,
    rewriteStaticImportLine,
    rewriteStaticImportsInSource,
    stripNonCssStaticImportsInSource,
    transpileTypeScriptToJs
} from './hoisted-code-transforms.js';

export function createPageIrMergeCache(pageIr) {
    const hoisted = pageIr?.hoisted || {};
    const stateEntries = Array.isArray(hoisted.state) ? hoisted.state : [];
    const signals = Array.isArray(pageIr?.signals) ? pageIr.signals : [];
    const signalIndexByStateKey = new Map();
    const signalIndicesByStateIndex = new Map();

    for (let index = 0; index < signals.length; index++) {
        const stateIndex = signals[index]?.state_index;
        if (!Number.isInteger(stateIndex) || stateIndex < 0) {
            continue;
        }
        const stateKey = stateEntries[stateIndex]?.key;
        if (typeof stateKey === 'string' && stateKey.length > 0 && !signalIndexByStateKey.has(stateKey)) {
            signalIndexByStateKey.set(stateKey, index);
        }
        const existingIndices = signalIndicesByStateIndex.get(stateIndex);
        if (existingIndices) {
            existingIndices.push(index);
        } else {
            signalIndicesByStateIndex.set(stateIndex, [index]);
        }
    }

    return {
        stateEntries,
        signals,
        importSet: new Set(Array.isArray(hoisted.imports) ? hoisted.imports : []),
        declarationSet: new Set(Array.isArray(hoisted.declarations) ? hoisted.declarations : []),
        functionSet: new Set(Array.isArray(hoisted.functions) ? hoisted.functions : []),
        hoistedSignalSet: new Set(Array.isArray(hoisted.signals) ? hoisted.signals : []),
        stateKeySet: new Set(stateEntries.map((entry) => entry?.key).filter(Boolean)),
        stateIndexByKey: new Map(
            stateEntries
                .map((entry, index) => [entry?.key, index])
                .filter(([key]) => typeof key === 'string' && key.length > 0)
        ),
        runtimeSignalStateKeySet: new Set(
            signals
                .map((signal) => {
                    const stateIndex = signal?.state_index;
                    return Number.isInteger(stateIndex) ? stateEntries[stateIndex]?.key : null;
                })
                .filter(Boolean)
        ),
        signalIndexByStateKey,
        signalIndicesByStateIndex,
        codeSet: new Set(Array.isArray(hoisted.code) ? hoisted.code : [])
    };
}

export function addMergeMetric(mergeMetrics, key, value) {
    if (!mergeMetrics || typeof mergeMetrics !== 'object' || !Number.isFinite(value)) {
        return;
    }
    mergeMetrics[key] = (mergeMetrics[key] || 0) + value;
}

export function mergeComponentIr(
    pageIr,
    compIr,
    compPath,
    pageFile,
    options,
    seenStaticImports,
    knownRefKeys = null,
    mergeCache = null,
    mergeMetrics = null,
    transformCache = null
) {
    const componentScriptsStartedAt = performance.now();
    if (compIr.components_scripts) {
        for (const [hoistId, script] of Object.entries(compIr.components_scripts)) {
            if (!pageIr.components_scripts[hoistId]) {
                pageIr.components_scripts[hoistId] = script;
            }
        }
    }
    addMergeMetric(mergeMetrics, 'componentScriptsMs', performance.now() - componentScriptsStartedAt);

    const componentInstancesStartedAt = performance.now();
    if (compIr.component_instances?.length) {
        pageIr.component_instances.push(...compIr.component_instances);
    }
    addMergeMetric(mergeMetrics, 'componentInstancesMs', performance.now() - componentInstancesStartedAt);

    const refBindingsStartedAt = performance.now();
    if (knownRefKeys instanceof Set && Array.isArray(compIr.ref_bindings)) {
        const componentStateBindings = Array.isArray(compIr?.hoisted?.state) ? compIr.hoisted.state : [];
        for (const binding of compIr.ref_bindings) {
            if (!binding || typeof binding.identifier !== 'string' || binding.identifier.length === 0) {
                continue;
            }
            const resolved = resolveStateKeyFromBindings(binding.identifier, componentStateBindings);
            knownRefKeys.add(resolved || binding.identifier);
        }
    }
    addMergeMetric(mergeMetrics, 'refBindingsMs', performance.now() - refBindingsStartedAt);

    const importsStartedAt = performance.now();
    if (compIr.hoisted?.imports?.length) {
        for (const imp of compIr.hoisted.imports) {
            const rebased = rewriteStaticImportLine(imp, compPath, pageFile);
            if (options.cssImportsOnly) {
                const spec = extractStaticImportSpecifier(rebased);
                if (!spec || !isCssSpecifier(spec)) {
                    continue;
                }
            }
            if (mergeCache?.importSet instanceof Set) {
                if (mergeCache.importSet.has(rebased)) {
                    continue;
                }
                mergeCache.importSet.add(rebased);
            } else if (pageIr.hoisted.imports.includes(rebased)) {
                continue;
            }
            if (!mergeCache?.importSet || mergeCache.importSet.has(rebased)) {
                pageIr.hoisted.imports.push(rebased);
            }
        }
    }
    addMergeMetric(mergeMetrics, 'importsMs', performance.now() - importsStartedAt);

    const hoistedSymbolsStartedAt = performance.now();
    if (options.includeCode && compIr.hoisted) {
        if (Array.isArray(compIr.hoisted.declarations)) {
            for (const decl of compIr.hoisted.declarations) {
                if (mergeCache?.declarationSet instanceof Set) {
                    if (mergeCache.declarationSet.has(decl)) {
                        continue;
                    }
                    mergeCache.declarationSet.add(decl);
                } else if (pageIr.hoisted.declarations.includes(decl)) {
                    continue;
                }
                pageIr.hoisted.declarations.push(decl);
            }
        }
        if (Array.isArray(compIr.hoisted.functions)) {
            for (const fnName of compIr.hoisted.functions) {
                if (mergeCache?.functionSet instanceof Set) {
                    if (mergeCache.functionSet.has(fnName)) {
                        continue;
                    }
                    mergeCache.functionSet.add(fnName);
                } else if (pageIr.hoisted.functions.includes(fnName)) {
                    continue;
                }
                pageIr.hoisted.functions.push(fnName);
            }
        }
        if (Array.isArray(compIr.hoisted.signals)) {
            for (const signalName of compIr.hoisted.signals) {
                if (mergeCache?.hoistedSignalSet instanceof Set) {
                    if (mergeCache.hoistedSignalSet.has(signalName)) {
                        continue;
                    }
                    mergeCache.hoistedSignalSet.add(signalName);
                } else if (pageIr.hoisted.signals.includes(signalName)) {
                    continue;
                }
                pageIr.hoisted.signals.push(signalName);
            }
        }
        if (Array.isArray(compIr.hoisted.state)) {
            const existingKeys = mergeCache?.stateKeySet instanceof Set
                ? mergeCache.stateKeySet
                : new Set(
                    (pageIr.hoisted.state || [])
                        .map((entry) => entry && typeof entry === 'object' ? entry.key : null)
                        .filter(Boolean)
                );
            for (const stateEntry of compIr.hoisted.state) {
                if (!stateEntry || typeof stateEntry !== 'object') {
                    continue;
                }
                if (typeof stateEntry.key !== 'string' || stateEntry.key.length === 0 || existingKeys.has(stateEntry.key)) {
                    continue;
                }
                existingKeys.add(stateEntry.key);
                pageIr.hoisted.state.push(stateEntry);
                if (mergeCache?.stateIndexByKey instanceof Map) {
                    mergeCache.stateIndexByKey.set(stateEntry.key, pageIr.hoisted.state.length - 1);
                }
            }
        }
    }
    addMergeMetric(mergeMetrics, 'hoistedSymbolsMs', performance.now() - hoistedSymbolsStartedAt);

    const runtimeSignalsStartedAt = performance.now();
    if (options.includeCode && Array.isArray(compIr.signals)) {
        pageIr.signals = Array.isArray(pageIr.signals) ? pageIr.signals : [];
        const existingSignalStateKeys = mergeCache?.runtimeSignalStateKeySet instanceof Set
            ? mergeCache.runtimeSignalStateKeySet
            : new Set(
                pageIr.signals
                    .map((signal) => {
                        const stateIndex = signal?.state_index;
                        return Number.isInteger(stateIndex) ? pageIr.hoisted.state?.[stateIndex]?.key : null;
                    })
                    .filter(Boolean)
            );

        for (const signal of compIr.signals) {
            if (!signal || !Number.isInteger(signal.state_index)) {
                continue;
            }
            const stateKey = compIr.hoisted?.state?.[signal.state_index]?.key;
            if (typeof stateKey !== 'string' || stateKey.length === 0) {
                continue;
            }
            const pageStateIndex = mergeCache?.stateIndexByKey instanceof Map
                ? mergeCache.stateIndexByKey.get(stateKey)
                : pageIr.hoisted.state.findIndex((entry) => entry?.key === stateKey);
            if (!Number.isInteger(pageStateIndex) || pageStateIndex < 0 || existingSignalStateKeys.has(stateKey)) {
                continue;
            }
            existingSignalStateKeys.add(stateKey);
            const nextSignalIndex = pageIr.signals.length;
            pageIr.signals.push({
                id: nextSignalIndex,
                kind: typeof signal.kind === 'string' && signal.kind.length > 0 ? signal.kind : 'signal',
                state_index: pageStateIndex
            });
            if (mergeCache?.signalIndexByStateKey instanceof Map && !mergeCache.signalIndexByStateKey.has(stateKey)) {
                mergeCache.signalIndexByStateKey.set(stateKey, nextSignalIndex);
            }
            if (mergeCache?.signalIndicesByStateIndex instanceof Map) {
                const existingIndices = mergeCache.signalIndicesByStateIndex.get(pageStateIndex);
                if (existingIndices) {
                    existingIndices.push(nextSignalIndex);
                } else {
                    mergeCache.signalIndicesByStateIndex.set(pageStateIndex, [nextSignalIndex]);
                }
            }
        }
    }
    addMergeMetric(mergeMetrics, 'runtimeSignalsMs', performance.now() - runtimeSignalsStartedAt);

    const hoistedCodeStartedAt = performance.now();
    if (options.includeCode && compIr.hoisted?.code?.length) {
        for (const block of compIr.hoisted.code) {
            const rebaseStartedAt = performance.now();
            const rebased = rewriteStaticImportsInSource(block, compPath, pageFile);
            addMergeMetric(mergeMetrics, 'codeRebaseImportsMs', performance.now() - rebaseStartedAt);

            const filterImportsStartedAt = performance.now();
            const filteredImports = options.cssImportsOnly ? stripNonCssStaticImportsInSource(rebased) : rebased;
            addMergeMetric(mergeMetrics, 'codeFilterImportsMs', performance.now() - filterImportsStartedAt);

            const transpileStartedAt = performance.now();
            const transpiled = transpileTypeScriptToJs(filteredImports, compPath, transformCache, mergeMetrics);
            addMergeMetric(mergeMetrics, 'codeTranspileMs', performance.now() - transpileStartedAt);

            const propsPreludeStartedAt = performance.now();
            const withPropsPrelude = injectPropsPrelude(
                transpiled,
                options.componentAttrs || '',
                options.componentAttrsRewrite || null
            );
            addMergeMetric(mergeMetrics, 'codePropsPreludeMs', performance.now() - propsPreludeStartedAt);

            const dedupeImportsStartedAt = performance.now();
            const deduped = dedupeStaticImportsInSource(withPropsPrelude, seenStaticImports);
            addMergeMetric(mergeMetrics, 'codeDedupeImportsMs', performance.now() - dedupeImportsStartedAt);

            const deferRuntimeStartedAt = performance.now();
            const deferred = deferComponentRuntimeBlock(deduped, transformCache, mergeMetrics);
            addMergeMetric(mergeMetrics, 'codeDeferRuntimeMs', performance.now() - deferRuntimeStartedAt);

            if (deferred.trim().length > 0) {
                if (mergeCache?.codeSet instanceof Set) {
                    if (mergeCache.codeSet.has(deferred)) {
                        continue;
                    }
                    mergeCache.codeSet.add(deferred);
                } else if (pageIr.hoisted.code.includes(deferred)) {
                    continue;
                }
                pageIr.hoisted.code.push(deferred);
            }
        }
    }
    addMergeMetric(mergeMetrics, 'hoistedCodeMs', performance.now() - hoistedCodeStartedAt);
}
