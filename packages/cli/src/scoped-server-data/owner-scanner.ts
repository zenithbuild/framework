import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { collectReachableOwnerPaths } from '../component-occurrences.js';
import { extractTemplate, isDocumentMode } from '../resolve-components.js';
import { analyzeOwnerServerFile } from './analyze-owner-file.js';
import {
    createScopedServerDiagnostic,
    SCOPED_SERVER_DIAGNOSTIC,
    sortScopedServerDiagnostics
} from './diagnostics.js';
import type {
    ScanRouteScopedServerOwnersOptions,
    ScanRouteScopedServerOwnersResult,
    ScopedServerDiagnostic
} from './types.js';

export type {
    CompilerOptsLike,
    OwnerFileAnalysisResult,
    ScanRouteScopedServerOwnersOptions,
    ScanRouteScopedServerOwnersResult,
    ScopedServerDataOwner,
    ScopedServerDataOwnerBase,
    ScopedServerDiagnostic,
    ScopedServerOwnerKind,
    ScopedServerOwnerSyntax
} from './types.js';

export { analyzeOwnerServerFile } from './analyze-owner-file.js';
export {
    createScopedServerDiagnostic,
    SCOPED_SERVER_DIAGNOSTIC,
    sortScopedServerDiagnostics
} from './diagnostics.js';

export function scanRouteScopedServerOwners(
    options: ScanRouteScopedServerOwnersOptions
): ScanRouteScopedServerOwnersResult {
    const pageSource = String(options.pageSource || '');
    const pageFile = String(options.pageFile || '');
    const registry = options.registry;
    const srcDir = resolve(String(options.srcDir || ''));
    const compilerOpts = options.compilerOpts || {};

    const owners: ScanRouteScopedServerOwnersResult['owners'] = [];
    const diagnostics: ScopedServerDiagnostic[] = [];

    diagnostics.push(...detectCompetingDocumentRoots(pageSource, registry, pageFile));

    const ownerPaths = collectReachableOwnerPaths(pageSource, registry, pageFile).sort();
    for (const ownerPath of ownerPaths) {
        const ownerSource = readFileSync(ownerPath, 'utf8');
        const result = analyzeOwnerServerFile(ownerSource, ownerPath, compilerOpts);
        diagnostics.push(...result.diagnostics);
        if (result.owner) {
            owners.push({
                ...result.owner,
                ownerKey: toOwnerKey(ownerPath, srcDir)
            });
        }
    }

    return {
        owners,
        diagnostics: sortScopedServerDiagnostics(diagnostics)
    };
}

function detectCompetingDocumentRoots(
    pageSource: string,
    registry: Map<string, string>,
    pageFile: string
): ScopedServerDiagnostic[] {
    const diagnostics: ScopedServerDiagnostic[] = [];
    let documentRootCount = 0;

    if (isDocumentMode(extractTemplate(pageSource))) {
        documentRootCount += 1;
    }

    for (const ownerPath of collectReachableOwnerPaths(pageSource, registry, pageFile)) {
        const ownerTemplate = extractTemplate(readFileSync(ownerPath, 'utf8'));
        if (isDocumentMode(ownerTemplate)) {
            documentRootCount += 1;
        }
    }

    if (documentRootCount > 1) {
        diagnostics.push(
            createScopedServerDiagnostic(
                SCOPED_SERVER_DIAGNOSTIC.COMPETING_DOCUMENT_ROOTS,
                'error',
                'Page render must resolve to exactly one document root.',
                pageFile
            )
        );
    }

    return diagnostics;
}

export function toOwnerKey(ownerPath: string, srcDir: string): string {
    const rel = relative(srcDir, resolve(ownerPath)).replace(/\\/g, '/');
    return rel.startsWith('src/') ? rel : `src/${rel}`;
}
