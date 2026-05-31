import { resolve } from 'node:path';
import { collectExpandedComponentOccurrences } from '../component-occurrences.js';
import { scanRouteScopedServerOwners, toOwnerKey } from './owner-scanner.js';
import { sortScopedServerDiagnostics } from './diagnostics.js';
import { parseScopedComponentStaticProps } from './static-props.js';
import type {
    AnalyzeRouteScopedServerMetadataOptions,
    AnalyzeRouteScopedServerMetadataResult,
    ManifestScopedServerDataEntry,
    ManifestScopedServerDataInstance,
    ScopedServerDataOwner,
    ScopedServerDiagnostic,
    ScopedServerInstanceStrategy,
    ScopedServerStaticProps
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

    const componentOccurrences = collectExpandedComponentOccurrences(pageSource, registry, pageFile);
    const occurrenceCountByPath = buildOccurrenceCountByPath(componentOccurrences);
    const occurrenceDetails = buildScopedComponentOccurrenceDetails({
        componentOccurrences,
        owners: scanResult.owners,
        srcDir
    });

    const scopedServerData = scanResult.owners.map((owner) =>
        toManifestScopedServerDataEntry(owner, occurrenceCountByPath, occurrenceDetails.byOwnerKey)
    );

    return {
        hasScopedServerData: scopedServerData.length > 0,
        scopedServerData,
        diagnostics: sortScopedServerDiagnostics([
            ...scanResult.diagnostics,
            ...occurrenceDetails.diagnostics
        ])
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
    occurrenceCountByPath: Map<string, number>,
    occurrenceDetailsByOwnerKey: Map<string, ScopedComponentOccurrenceDetails[]>
): ManifestScopedServerDataEntry {
    const instanceStrategy = resolveInstanceStrategy(owner, occurrenceCountByPath);
    const entry: ManifestScopedServerDataEntry = {
        ownerKind: owner.ownerKind,
        ownerKey: owner.ownerKey,
        syntax: owner.syntax,
        exportName: owner.exportName,
        instanceStrategy
    };

    if (owner.syntax === 'variables' && owner.serializedVariableNames.length > 0) {
        entry.serializedVariableNames = [...owner.serializedVariableNames];
    }

    if (owner.ownerKind === 'component') {
        const occurrences = occurrenceDetailsByOwnerKey.get(owner.ownerKey) || [];
        if (instanceStrategy === 'per-instance') {
            entry.instances = occurrences.map(({ key, occurrenceId, props }) => ({
                key,
                occurrenceId,
                props
            }));
        } else if (occurrences.length === 1 && Object.keys(occurrences[0].props).length > 0) {
            entry.props = occurrences[0].props;
        }
    }

    return entry;
}

interface ScopedComponentOccurrenceDetails {
    key: string;
    occurrenceId: string;
    props: ScopedServerStaticProps;
}

function buildScopedComponentOccurrenceDetails({
    componentOccurrences,
    owners,
    srcDir
}: {
    componentOccurrences: Array<{ attrs: string; ownerPath: string; componentPath: string }>;
    owners: ScopedServerDataOwner[];
    srcDir: string;
}): {
    byOwnerKey: Map<string, ScopedComponentOccurrenceDetails[]>;
    diagnostics: ScopedServerDiagnostic[];
} {
    const componentOwnerByKey = new Map<string, ScopedServerDataOwner>();
    for (const owner of owners) {
        if (owner.ownerKind === 'component') {
            componentOwnerByKey.set(owner.ownerKey, owner);
        }
    }

    const byOwnerKey = new Map<string, ScopedComponentOccurrenceDetails[]>();
    const occurrenceCountByOwnerKey = new Map<string, number>();
    const diagnostics: ScopedServerDiagnostic[] = [];

    for (const occurrence of componentOccurrences) {
        if (typeof occurrence.componentPath !== 'string' || occurrence.componentPath.length === 0) {
            continue;
        }
        const ownerKey = toOwnerKey(occurrence.componentPath, srcDir);
        if (!componentOwnerByKey.has(ownerKey)) {
            continue;
        }

        const index = occurrenceCountByOwnerKey.get(ownerKey) || 0;
        occurrenceCountByOwnerKey.set(ownerKey, index + 1);
        const occurrenceId = `o${index}`;
        const parsed = parseScopedComponentStaticProps({
            attrs: occurrence.attrs,
            ownerKey,
            contextFile: occurrence.ownerPath || occurrence.componentPath,
            occurrenceId
        });
        diagnostics.push(...parsed.diagnostics);

        if (!byOwnerKey.has(ownerKey)) {
            byOwnerKey.set(ownerKey, []);
        }
        byOwnerKey.get(ownerKey)?.push({
            key: `component:${ownerKey}:${occurrenceId}`,
            occurrenceId,
            props: parsed.props
        });
    }

    return { byOwnerKey, diagnostics };
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
