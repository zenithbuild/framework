import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { collectExpandedComponentOccurrences } from '../component-occurrences.js';
import { scanRouteScopedServerOwners, toOwnerKey } from './owner-scanner.js';
import { partitionScriptBlocks } from './parse-owner-server-block.js';
import type {
    CompilerOptsLike,
    ManifestScopedServerDataEntry,
    ScopedServerDataOwner,
    ScopedServerDiagnostic
} from './types.js';

type TypeScriptApi = typeof import('typescript');

export interface LowerRouteScopedServerDataOptions {
    pageSource: string;
    pageFile: string;
    registry: Map<string, string>;
    srcDir: string;
    projectRoot?: string;
    compilerOpts?: CompilerOptsLike;
    scopedServerData?: ManifestScopedServerDataEntry[];
}

export interface LoweredScopedServerDataEntry extends ManifestScopedServerDataEntry {
    module: string;
}

export interface LoweredScopedServerDataModule {
    ownerKey: string;
    ownerPath: string;
    module: string;
    source: string;
    sourcePath: string;
}

export interface LoweredScopedServerDataRoute {
    scopedServerData: LoweredScopedServerDataEntry[];
    modules: LoweredScopedServerDataModule[];
}

const PACKAGE_REQUIRE = createRequire(import.meta.url);
const INVALID_OWNER_KEY_ERROR = '[Zenith:ScopedServerData] Invalid scoped server data owner key.';
const INVALID_MODULE_PATH_ERROR = '[Zenith:ScopedServerData] Invalid scoped server data module path.';

export function lowerRouteScopedServerData(
    options: LowerRouteScopedServerDataOptions
): LoweredScopedServerDataRoute {
    const pageSource = String(options.pageSource || '');
    const pageFile = resolve(String(options.pageFile || ''));
    const srcDir = resolve(String(options.srcDir || ''));
    const registry = options.registry;
    const compilerOpts = options.compilerOpts || {};
    const metadata = Array.isArray(options.scopedServerData) ? options.scopedServerData : [];
    const scanResult = scanRouteScopedServerOwners({
        pageSource,
        pageFile,
        registry,
        srcDir,
        compilerOpts
    });

    assertNoLoweringDiagnostics(scanResult.diagnostics, pageFile);

    const ownerByKey = new Map<string, ScopedServerDataOwner>();
    for (const owner of scanResult.owners) {
        ownerByKey.set(owner.ownerKey, owner);
    }

    const metadataByKey = new Map<string, ManifestScopedServerDataEntry>();
    for (const entry of metadata) {
        if (entry && typeof entry.ownerKey === 'string') {
            metadataByKey.set(entry.ownerKey, entry);
        }
    }

    const orderedKeys = buildEncounterOrderedOwnerKeys({
        pageSource,
        pageFile,
        registry,
        srcDir,
        ownerByKey,
        metadata
    });
    const ts = resolveTypeScriptApi(options.projectRoot);
    const scopedServerData: LoweredScopedServerDataEntry[] = [];
    const modules: LoweredScopedServerDataModule[] = [];

    for (const ownerKey of orderedKeys) {
        const owner = ownerByKey.get(ownerKey);
        if (!owner) {
            throw new Error(
                `[Zenith:ScopedServerData] Cannot lower missing scoped server data owner "${ownerKey}" for "${pageFile}".`
            );
        }

        const modulePath = scopedServerModulePathForOwnerKey(ownerKey);
        const source = lowerOwnerSource(owner, ts);
        const entry: LoweredScopedServerDataEntry = {
            ...(metadataByKey.get(ownerKey) || toFallbackManifestEntry(owner)),
            module: modulePath
        };
        if (
            owner.syntax === 'variables' &&
            owner.serializedVariableNames.length > 0 &&
            !Array.isArray(entry.serializedVariableNames)
        ) {
            entry.serializedVariableNames = [...owner.serializedVariableNames];
        }

        scopedServerData.push(entry);
        modules.push({
            ownerKey,
            ownerPath: owner.ownerPath,
            module: modulePath,
            source,
            sourcePath: owner.ownerPath
        });
    }

    return { scopedServerData, modules };
}

export function scopedServerModulePathForOwnerKey(ownerKey: string): string {
    const raw = String(ownerKey || '');
    if (!raw || isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
        throw new Error(INVALID_OWNER_KEY_ERROR);
    }

    const normalized = raw.replace(/\\/g, '/');
    const parts = normalized.split('/');
    if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
        throw new Error(INVALID_OWNER_KEY_ERROR);
    }

    return `scoped/${parts.join('/')}.mjs`;
}

export function resolveScopedServerModuleOutputPath(serverDir: string, modulePath: string): string {
    const raw = String(modulePath || '');
    if (!raw || isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
        throw new Error(INVALID_MODULE_PATH_ERROR);
    }

    const normalized = raw.replace(/\\/g, '/');
    if (!normalized.startsWith('scoped/') || normalized.split('/').some((part) => part === '..' || part === '.')) {
        throw new Error(INVALID_MODULE_PATH_ERROR);
    }

    const scopedRoot = resolve(serverDir, 'scoped');
    const outputPath = resolve(serverDir, normalized);
    if (outputPath !== scopedRoot && !outputPath.startsWith(`${scopedRoot}${sep}`)) {
        throw new Error(INVALID_MODULE_PATH_ERROR);
    }
    return outputPath;
}

function buildEncounterOrderedOwnerKeys({
    pageSource,
    pageFile,
    registry,
    srcDir,
    ownerByKey,
    metadata
}: {
    pageSource: string;
    pageFile: string;
    registry: Map<string, string>;
    srcDir: string;
    ownerByKey: Map<string, ScopedServerDataOwner>;
    metadata: ManifestScopedServerDataEntry[];
}): string[] {
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const occurrence of collectExpandedComponentOccurrences(pageSource, registry, pageFile)) {
        if (typeof occurrence.componentPath !== 'string' || occurrence.componentPath.length === 0) {
            continue;
        }
        const ownerKey = toOwnerKey(occurrence.componentPath, srcDir);
        if (!ownerByKey.has(ownerKey) || seen.has(ownerKey)) {
            continue;
        }
        seen.add(ownerKey);
        keys.push(ownerKey);
    }

    for (const entry of metadata) {
        const ownerKey = String(entry?.ownerKey || '');
        if (ownerKey && ownerByKey.has(ownerKey) && !seen.has(ownerKey)) {
            seen.add(ownerKey);
            keys.push(ownerKey);
        }
    }

    for (const ownerKey of ownerByKey.keys()) {
        if (!seen.has(ownerKey)) {
            keys.push(ownerKey);
        }
    }

    return keys;
}

function lowerOwnerSource(owner: ScopedServerDataOwner, ts: TypeScriptApi): string {
    const ownerSource = readFileSync(owner.ownerPath, 'utf8');
    const serverBody = readSingleServerBody(ownerSource, owner.ownerPath);
    assertNoRouteResultMisuse(serverBody, owner.ownerPath);

    if (owner.syntax === 'explicit-data') {
        return ensureTrailingNewline(serverBody);
    }

    const { imports, body } = partitionTopLevelImports(ts, serverBody, owner.ownerPath);
    const lines = [
        imports,
        'export async function data(ctx, props) {',
        indentBlock(body),
        '  return {',
        ...owner.serializedVariableNames.map((name) => `    ${name},`),
        '  };',
        '}',
        ''
    ].filter((line) => line !== null && line !== undefined);

    return lines.join('\n');
}

function readSingleServerBody(ownerSource: string, ownerPath: string): string {
    const { serverBlocks } = partitionScriptBlocks(ownerSource);
    if (serverBlocks.length !== 1) {
        throw new Error(
            `[Zenith:ScopedServerData] Cannot lower scoped server data owner "${ownerPath}" because it must contain exactly one server block.`
        );
    }
    return String(serverBlocks[0]?.body || '').trim();
}

function partitionTopLevelImports(ts: TypeScriptApi, source: string, filePath: string): { imports: string; body: string } {
    const parsed = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const importRanges: Array<[number, number]> = [];

    for (const statement of parsed.statements) {
        if (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) {
            importRanges.push([statement.getFullStart(), statement.end]);
        }
    }

    if (importRanges.length === 0) {
        return { imports: '', body: source.trim() };
    }

    const imports = importRanges
        .map(([start, end]) => source.slice(start, end).trim())
        .filter(Boolean)
        .join('\n');

    let cursor = 0;
    const bodyParts: string[] = [];
    for (const [start, end] of importRanges) {
        bodyParts.push(source.slice(cursor, start));
        cursor = end;
    }
    bodyParts.push(source.slice(cursor));

    return {
        imports,
        body: bodyParts.join('').trim()
    };
}

function assertNoRouteResultMisuse(serverBody: string, ownerPath: string): void {
    const ctxMisuse = serverBody.match(/\bctx\s*\.\s*(redirect|deny|data)\s*\(/);
    if (ctxMisuse) {
        throw new Error(
            `[Zenith:ScopedServerData] Scoped server data owner "${ownerPath}" cannot use route-only result API ctx.${ctxMisuse[1]}().`
        );
    }

    if (/\bexport\s+(?:async\s+)?function\s+action\b|\bexport\s+const\s+action\s*=/.test(serverBody)) {
        throw new Error(
            `[Zenith:ScopedServerData] Scoped server data owner "${ownerPath}" cannot declare route-only action().`
        );
    }
}

function assertNoLoweringDiagnostics(diagnostics: ScopedServerDiagnostic[], pageFile: string): void {
    const errors = diagnostics.filter((item) => item.severity === 'error');
    if (errors.length === 0) {
        return;
    }

    const first = errors[0];
    throw new Error(
        `[Zenith:ScopedServerData] Cannot lower scoped server data for ${pageFile}: ${first.code} ${first.message} (${first.filePath})`
    );
}

function resolveTypeScriptApi(projectRoot?: string): TypeScriptApi {
    if (projectRoot) {
        try {
            const projectRequire = createRequire(join(projectRoot, '__zenith_scoped_server_data_lowering__.js'));
            return projectRequire('typescript') as TypeScriptApi;
        } catch {
            // Fall through to the CLI workspace/package dependency.
        }
    }

    try {
        return PACKAGE_REQUIRE('typescript') as TypeScriptApi;
    } catch {
        throw new Error(
            '[Zenith:ScopedServerData] Scoped server data lowering requires the `typescript` package.'
        );
    }
}

function toFallbackManifestEntry(owner: ScopedServerDataOwner): ManifestScopedServerDataEntry {
    const entry: ManifestScopedServerDataEntry = {
        ownerKind: owner.ownerKind,
        ownerKey: owner.ownerKey,
        syntax: owner.syntax,
        exportName: owner.exportName,
        instanceStrategy: owner.ownerKind === 'layout' ? 'singleton' : 'singleton'
    };
    if (owner.syntax === 'variables' && owner.serializedVariableNames.length > 0) {
        entry.serializedVariableNames = [...owner.serializedVariableNames];
    }
    return entry;
}

function indentBlock(source: string): string {
    const trimmed = String(source || '').trim();
    if (!trimmed) {
        return '';
    }
    return trimmed
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n');
}

function ensureTrailingNewline(source: string): string {
    return source.endsWith('\n') ? source : `${source}\n`;
}
