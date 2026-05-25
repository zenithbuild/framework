import { readRouteHandlerExport } from '../route-handler-export-analysis.js';
import { extractTemplate } from '../resolve-components.js';
import {
    createScopedServerDiagnostic,
    SCOPED_SERVER_DIAGNOSTIC
} from './diagnostics.js';
import {
    partitionScriptBlocks,
    serverBlockRequiresLangTs
} from './parse-owner-server-block.js';
import { computeSerializationSet } from './serialization-set.js';
import type {
    CompilerOptsLike,
    OwnerFileAnalysisResult,
    ScopedServerDataOwnerBase,
    ScopedServerDiagnostic,
    ScopedServerOwnerKind,
    ScriptBlockPartition
} from './types.js';

export const RESERVED_LEVEL1_BINDING_NAMES = [
    'data',
    'props',
    'params',
    'ssr',
    'ssr_data',
    'ctx'
] as const;

const TOP_LEVEL_CONST_RE = /(?:^|\n)\s*const\s+([A-Za-z_$][\w$]*)\s*=/g;
const TOP_LEVEL_LET_RE = /(?:^|\n)\s*let\s+([A-Za-z_$][\w$]*)\s*=/g;
const EXPLICIT_DATA_EXPORT_RE = /\bexport\s+const\s+data\s*=\s*/;

export function analyzeOwnerServerFile(
    ownerSource: string,
    ownerPath: string,
    compilerOpts: CompilerOptsLike = {}
): OwnerFileAnalysisResult {
    const diagnostics: ScopedServerDiagnostic[] = [];
    const { serverBlocks, clientBlocks } = partitionScriptBlocks(ownerSource);

    if (serverBlocks.length === 0) {
        return { owner: null, diagnostics };
    }

    if (serverBlocks.length > 1) {
        diagnostics.push(
            createScopedServerDiagnostic(
                SCOPED_SERVER_DIAGNOSTIC.MULTIPLE_SERVER_BLOCKS,
                'error',
                'Multiple <script server> blocks are not supported in layout/component owners.',
                ownerPath
            )
        );
        return { owner: null, diagnostics };
    }

    const serverBlock = serverBlocks[0];
    const serverBody = String(serverBlock.body || '').trim();

    if (serverBlockRequiresLangTs(serverBlock.attrs, compilerOpts)) {
        diagnostics.push(
            createScopedServerDiagnostic(
                SCOPED_SERVER_DIAGNOSTIC.MISSING_LANG_TS,
                'error',
                'Layout/component server blocks require lang="ts" (or typescriptDefault).',
                ownerPath
            )
        );
    }

    diagnostics.push(...collectRouteControlMisuseDiagnostics(serverBody, ownerPath));
    diagnostics.push(...collectLetDiagnostics(serverBody, ownerPath));

    const hasExplicitData = EXPLICIT_DATA_EXPORT_RE.test(serverBody);
    const level1Names = collectTopLevelConstNames(serverBody);

    if (hasExplicitData && level1Names.length > 0) {
        diagnostics.push(
            createScopedServerDiagnostic(
                SCOPED_SERVER_DIAGNOSTIC.MIXED_LEVEL1_AND_DATA,
                'error',
                'Use either top-level server const values or export const data, not both.',
                ownerPath
            )
        );
    }

    diagnostics.push(...collectReservedBindingDiagnostics(level1Names, ownerPath));
    diagnostics.push(...collectClientLeakDiagnostics(level1Names, clientBlocks, ownerPath));

    if (diagnostics.some((item) => item.severity === 'error')) {
        return { owner: null, diagnostics };
    }

    const template = extractTemplate(ownerSource);
    const ownerKind = inferOwnerKind(ownerPath);

    if (hasExplicitData) {
        const owner: ScopedServerDataOwnerBase = {
            ownerKind,
            ownerPath,
            syntax: 'explicit-data',
            serializedVariableNames: collectExplicitDataTemplateRefs(template),
            exportName: 'data'
        };
        return { owner, diagnostics };
    }

    if (level1Names.length === 0) {
        return { owner: null, diagnostics };
    }

    const serializedVariableNames = computeSerializationSet(level1Names, template);
    for (const name of level1Names) {
        if (!serializedVariableNames.includes(name)) {
            diagnostics.push(
                createScopedServerDiagnostic(
                    SCOPED_SERVER_DIAGNOSTIC.UNREFERENCED_SERVER_VAR,
                    'warning',
                    `Server variable "${name}" is not referenced by this owner's template and will not serialize.`,
                    ownerPath
                )
            );
        }
    }

    const owner: ScopedServerDataOwnerBase = {
        ownerKind,
        ownerPath,
        syntax: 'variables',
        serializedVariableNames,
        level1VariableNames: level1Names,
        exportName: 'data'
    };
    return { owner, diagnostics };
}

function collectRouteControlMisuseDiagnostics(serverBody: string, ownerPath: string): ScopedServerDiagnostic[] {
    const diagnostics: ScopedServerDiagnostic[] = [];
    const load = readRouteHandlerExport(serverBody, 'load');
    if (load.hasExport) {
        diagnostics.push(
            createScopedServerDiagnostic(
                SCOPED_SERVER_DIAGNOSTIC.OWNER_LOAD_MISUSE,
                'error',
                '`load()` is route-only in Zenith. Use server variables or scoped data() inside layouts/components.',
                ownerPath
            )
        );
    }
    const guard = readRouteHandlerExport(serverBody, 'guard');
    if (guard.hasExport) {
        diagnostics.push(
            createScopedServerDiagnostic(
                SCOPED_SERVER_DIAGNOSTIC.OWNER_GUARD_MISUSE,
                'error',
                '`guard()` is route-only in Zenith and cannot be declared in layout/component owners.',
                ownerPath
            )
        );
    }
    const action = readRouteHandlerExport(serverBody, 'action');
    if (action.hasExport) {
        diagnostics.push(
            createScopedServerDiagnostic(
                SCOPED_SERVER_DIAGNOSTIC.OWNER_ACTION_MISUSE,
                'error',
                '`action()` is route-only in Zenith and cannot be declared in layout/component owners.',
                ownerPath
            )
        );
    }
    return diagnostics;
}

function collectLetDiagnostics(serverBody: string, ownerPath: string): ScopedServerDiagnostic[] {
    const diagnostics: ScopedServerDiagnostic[] = [];
    for (const match of serverBody.matchAll(TOP_LEVEL_LET_RE)) {
        const name = String(match[1] || '');
        diagnostics.push(
            createScopedServerDiagnostic(
                SCOPED_SERVER_DIAGNOSTIC.LEVEL1_LET_REJECTED,
                'error',
                `Level 1 server variable "${name}" must use const, not let.`,
                ownerPath
            )
        );
    }
    return diagnostics;
}

function collectTopLevelConstNames(serverBody: string): string[] {
    const names: string[] = [];
    for (const match of serverBody.matchAll(TOP_LEVEL_CONST_RE)) {
        const name = String(match[1] || '');
        if (name && !names.includes(name)) {
            names.push(name);
        }
    }
    return names;
}

function collectReservedBindingDiagnostics(level1Names: string[], ownerPath: string): ScopedServerDiagnostic[] {
    const diagnostics: ScopedServerDiagnostic[] = [];
    const reserved = new Set<string>(RESERVED_LEVEL1_BINDING_NAMES);
    for (const name of level1Names) {
        if (reserved.has(name)) {
            diagnostics.push(
                createScopedServerDiagnostic(
                    SCOPED_SERVER_DIAGNOSTIC.RESERVED_BINDING,
                    'error',
                    `Server variable "${name}" uses a reserved binding name.`,
                    ownerPath
                )
            );
        }
    }
    return diagnostics;
}

function collectClientLeakDiagnostics(
    level1Names: string[],
    clientBlocks: ScriptBlockPartition[],
    ownerPath: string
): ScopedServerDiagnostic[] {
    const diagnostics: ScopedServerDiagnostic[] = [];
    if (level1Names.length === 0 || clientBlocks.length === 0) {
        return diagnostics;
    }
    const clientSource = clientBlocks.map((block) => block.body).join('\n');
    for (const name of level1Names) {
        const refRe = new RegExp(`\\b${escapeRegExp(name)}\\b`);
        if (refRe.test(clientSource)) {
            diagnostics.push(
                createScopedServerDiagnostic(
                    SCOPED_SERVER_DIAGNOSTIC.CLIENT_SCRIPT_LEAK,
                    'error',
                    `Server variable "${name}" is referenced from a client script block.`,
                    ownerPath
                )
            );
        }
    }
    return diagnostics;
}

function collectExplicitDataTemplateRefs(template: string): string[] {
    const refs: string[] = [];
    for (const match of String(template || '').matchAll(/\{data\.([A-Za-z_$][\w$]*)/g)) {
        const name = String(match[1] || '');
        if (name && !refs.includes(name)) {
            refs.push(name);
        }
    }
    return refs.sort();
}

function inferOwnerKind(ownerPath: string): ScopedServerOwnerKind {
    const normalized = String(ownerPath || '').replace(/\\/g, '/');
    return normalized.includes('/layouts/') ? 'layout' : 'component';
}

function escapeRegExp(value: string): string {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
