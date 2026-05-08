import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { createCompilerWarningEmitter } from '../build/compiler-runtime.js';
import { resolveBundlerBin } from '../toolchain-paths.js';
import { getActiveToolchainCandidate } from '../toolchain-runner.js';
import { maybeWarnAboutZenithVersionMismatch } from '../version-check.js';

export function createCompilerTotals() {
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

export function createExpressionRewriteMetrics() {
    return {
        calls: 0,
        compilerOwnedBindings: 0,
        ambiguousBindings: 0
    };
}

export function toManifestEntryMap(manifest, pagesDir) {
    const map = new Map();
    for (const entry of manifest) {
        map.set(resolve(pagesDir, entry.file), entry);
    }
    return map;
}

export function orderEnvelopes(manifest, pagesDir, envelopeByFile) {
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

export function isCssOnlyChange(changedFiles) {
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

function collectTemplateClassSignature(envelope) {
    const html = typeof envelope?.ir?.html === 'string' ? envelope.ir.html : '';
    if (!html) {
        return [];
    }
    const classes = new Set();
    const classAttrRe = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    let match;
    while ((match = classAttrRe.exec(html)) !== null) {
        const rawValue = String(match[1] || match[2] || '');
        for (const token of rawValue.split(/\s+/)) {
            const value = token.trim();
            if (value.length > 0) {
                classes.add(value);
            }
        }
    }
    return [...classes].sort();
}

export function buildPageOnlyFastPathSignature(envelope) {
    const ir = envelope.ir || {};
    return stableJson({
        route: envelope.route,
        router: envelope.router === true,
        interactivityShape: {
            requiresJs: envelope.requires_js === true,
            signals: Array.isArray(ir.signals) ? ir.signals.length : 0,
            refs: Array.isArray(ir.ref_bindings) ? ir.ref_bindings.length : 0,
            events: Array.isArray(ir.event_bindings)
                ? ir.event_bindings.map((entry) => [entry.index, entry.event]).sort()
                : [],
            markers: Array.isArray(ir.marker_bindings)
                ? ir.marker_bindings.map((entry) => [entry.index, entry.kind]).sort()
                : [],
            componentInstances: Array.isArray(ir.component_instances) ? ir.component_instances.length : 0,
            hoistedCode: Array.isArray(ir.hoisted?.code)
                ? ir.hoisted.code.filter((entry) => String(entry || '').trim().length > 0).length
                : 0,
            hoistedState: Array.isArray(ir.hoisted?.state) ? ir.hoisted.state.length : 0,
            hoistedSignals: Array.isArray(ir.hoisted?.signals) ? ir.hoisted.signals.length : 0
        },
        assetContract: collectEnvelopeAssetContract(envelope),
        templateClassSignature: collectTemplateClassSignature(envelope),
        styleBlocks: ir.style_blocks || [],
        serverScript: ir.server_script || null,
        prerender: ir.prerender === true,
        hasGuard: ir.has_guard === true,
        hasLoad: ir.has_load === true,
        hasAction: ir.has_action === true,
        guardModuleRef: ir.guard_module_ref || null,
        loadModuleRef: ir.load_module_ref || null,
        actionModuleRef: ir.action_module_ref || null
    });
}

export function buildGlobalGraphHash(envelopes) {
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

export function selectPageOnlyEntries(changedFiles, pagesDir, manifestEntryByPath) {
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

export async function maybeRunVersionCheck({
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

export function buildCompilerWarningEmitter(logger) {
    return createCompilerWarningEmitter((line) => {
        if (logger && typeof logger.warn === 'function') {
            logger.warn(line, { onceKey: `compiler-warning:${line}` });
            return;
        }
        console.warn(line);
    });
}
