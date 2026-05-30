import { resolve } from 'node:path';
import { collectExpandedComponentOccurrences } from '../component-occurrences.js';
import { scanRouteScopedServerOwners } from './owner-scanner.js';
import type {
    AnalyzeRouteScopedServerMetadataOptions,
    AnalyzeRouteScopedServerMetadataResult,
    ManifestScopedServerDataEntry,
    ScopedServerDataOwner,
    ScopedServerDiagnostic,
    ScopedServerInstanceStrategy
} from './types.js';

export type {
    AnalyzeRouteScopedServerMetadataOptions,
    AnalyzeRouteScopedServerMetadataResult,
    ManifestScopedServerDataEntry
} from './types.js';

export function analyzeRouteScopedServerMetadata(
    options: AnalyzeRouteScopedServerMetadataOptions
): AnalyzeRouteScopedServerMetadataResult {
    const pageSource = String(options.pageSource || '');
    const pageFile = resolve(String(options.pageFile || ''));
    const srcDir = resolve(String(options.srcDir || ''));
    const registry = options.registry;
    const compilerOpts = options.compilerOpts || {};

    const scanResult = scanRouteScopedServerOwners({
        pageSource,
        pageFile,
        registry,
        srcDir,
        compilerOpts
    });

    const occurrenceCountByPath = buildOccurrenceCountByPath(
        collectExpandedComponentOccurrences(pageSource, registry, pageFile)
    );

    const scopedServerData = scanResult.owners.map((owner) =>
        toManifestScopedServerDataEntry(owner, occurrenceCountByPath)
    );

    return {
        hasScopedServerData: scopedServerData.length > 0,
        scopedServerData,
        diagnostics: scanResult.diagnostics
    };
}

export function assertNoScopedServerBuildErrors(
    diagnostics: ScopedServerDiagnostic[],
    contextFile: string
): void {
    const errors = diagnostics.filter((item) => item.severity === 'error');
    if (errors.length === 0) {
        return;
    }

    const first = errors[0];
    throw new Error(
        `[zenith] Build failed for ${contextFile}: ${first.code} ${first.message} (${first.filePath})`
    );
}

function toManifestScopedServerDataEntry(
    owner: ScopedServerDataOwner,
    occurrenceCountByPath: Map<string, number>
): ManifestScopedServerDataEntry {
    const entry: ManifestScopedServerDataEntry = {
        ownerKind: owner.ownerKind,
        ownerKey: owner.ownerKey,
        syntax: owner.syntax,
        exportName: owner.exportName,
        instanceStrategy: resolveInstanceStrategy(owner, occurrenceCountByPath)
    };

    if (owner.syntax === 'variables' && owner.serializedVariableNames.length > 0) {
        entry.serializedVariableNames = [...owner.serializedVariableNames];
    }

    return entry;
}

function resolveInstanceStrategy(
    owner: ScopedServerDataOwner,
    occurrenceCountByPath: Map<string, number>
): ScopedServerInstanceStrategy {
    if (owner.ownerKind === 'layout') {
        return 'singleton';
    }

    const resolvedPath = resolve(owner.ownerPath);
    const count = occurrenceCountByPath.get(resolvedPath) ?? 1;
    return count > 1 ? 'per-instance' : 'singleton';
}

function buildOccurrenceCountByPath(
    componentOccurrences: Array<{ name: string; componentPath: string }>
): Map<string, number> {
    const occurrenceCountByPath = new Map<string, number>();

    for (const occurrence of componentOccurrences) {
        const key = occurrence.componentPath || occurrence.name;
        occurrenceCountByPath.set(key, (occurrenceCountByPath.get(key) || 0) + 1);
    }

    return occurrenceCountByPath;
}
