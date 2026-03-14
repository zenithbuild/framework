import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';

const DATA_EXPORT_RE = /\bexport\s+const\s+data\b/;
const LEGACY_EXPORT_RE = /\bexport\s+const\s+(?:ssr_data|props|ssr)\b/;

/**
 * @param {string} sourceFile
 * @param {'guard' | 'load'} kind
 * @returns {string[]}
 */
function adjacentModuleCandidates(sourceFile, kind) {
    const dir = dirname(sourceFile);
    const stem = basename(sourceFile, extname(sourceFile));
    const baseName = sourceFile.slice(0, -extname(sourceFile).length);
    const candidates = [];

    if (stem === 'index') {
        candidates.push(join(dir, `page.${kind}.ts`));
        candidates.push(join(dir, `page.${kind}.js`));
    }

    candidates.push(`${baseName}.${kind}.ts`);
    candidates.push(`${baseName}.${kind}.js`);
    return candidates;
}

/**
 * @param {string} sourceFile
 * @param {'guard' | 'load'} kind
 * @returns {string | null}
 */
function resolveAdjacentModule(sourceFile, kind) {
    const matches = adjacentModuleCandidates(sourceFile, kind).filter((candidate) => existsSync(candidate));
    if (matches.length === 0) {
        return null;
    }
    if (matches.length > 1) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: multiple adjacent ${kind} modules detected\n` +
            `  Matches: ${matches.join(', ')}\n` +
            `  Example: keep exactly one adjacent ${kind} module for this route`
        );
    }
    return matches[0];
}

/**
 * @param {string} fromFile
 * @param {string} targetFile
 * @returns {string}
 */
function renderRelativeSpecifier(fromFile, targetFile) {
    let specifier = relative(dirname(fromFile), targetFile).replaceAll('\\', '/');
    if (!specifier.startsWith('.')) {
        specifier = `./${specifier}`;
    }
    return specifier;
}

/**
 * @param {string} source
 * @returns {{ hasData: boolean, hasLegacy: boolean }}
 */
function classifyInlineServerSource(source) {
    const input = String(source || '');
    return {
        hasData: DATA_EXPORT_RE.test(input),
        hasLegacy: LEGACY_EXPORT_RE.test(input)
    };
}

/**
 * @param {{
 *   sourceFile: string,
 *   inlineServerScript?: { source: string, prerender: boolean, has_guard: boolean, has_load: boolean, source_path: string } | null,
 *   adjacentGuardPath?: string | null,
 *   adjacentLoadPath?: string | null
 * }} input
 * @returns {{ serverScript: { source: string, prerender: boolean, has_guard: boolean, has_load: boolean, source_path: string } | null, guardPath: string | null, loadPath: string | null }}
 */
export function composeServerScriptEnvelope({
    sourceFile,
    inlineServerScript = null,
    adjacentGuardPath = null,
    adjacentLoadPath = null
}) {
    const inlineSource = String(inlineServerScript?.source || '').trim();
    const inlineHasGuard = inlineServerScript?.has_guard === true;
    const inlineHasLoad = inlineServerScript?.has_load === true;
    const { hasData, hasLegacy } = classifyInlineServerSource(inlineSource);

    if (inlineHasGuard && adjacentGuardPath) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: guard is defined both inline and in an adjacent module\n` +
            `  Example: keep guard in either <script server> or ${basename(adjacentGuardPath)}, not both`
        );
    }

    if (inlineHasLoad && adjacentLoadPath) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: load is defined both inline and in an adjacent module\n` +
            `  Example: keep load in either <script server> or ${basename(adjacentLoadPath)}, not both`
        );
    }

    if (adjacentLoadPath && (hasData || hasLegacy)) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: an adjacent load module cannot be combined with inline data/legacy payload exports\n` +
            `  Example: remove export const data/ssr_data/props/ssr or move payload logic into load(ctx)`
        );
    }

    const prologue = [];
    if (adjacentGuardPath) {
        prologue.push(`export { guard } from '${renderRelativeSpecifier(sourceFile, adjacentGuardPath)}';`);
    }
    if (adjacentLoadPath) {
        prologue.push(`export { load } from '${renderRelativeSpecifier(sourceFile, adjacentLoadPath)}';`);
    }

    const mergedSource = [...prologue, inlineSource].filter(Boolean).join('\n');
    if (!mergedSource.trim()) {
        return {
            serverScript: null,
            guardPath: adjacentGuardPath,
            loadPath: adjacentLoadPath
        };
    }

    return {
        serverScript: {
            source: mergedSource,
            prerender: inlineServerScript?.prerender === true,
            has_guard: inlineHasGuard || Boolean(adjacentGuardPath),
            has_load: inlineHasLoad || Boolean(adjacentLoadPath),
            source_path: sourceFile
        },
        guardPath: adjacentGuardPath,
        loadPath: adjacentLoadPath
    };
}

/**
 * @param {string} sourceFile
 * @returns {{ guardPath: string | null, loadPath: string | null }}
 */
export function resolveAdjacentServerModules(sourceFile) {
    return {
        guardPath: resolveAdjacentModule(sourceFile, 'guard'),
        loadPath: resolveAdjacentModule(sourceFile, 'load')
    };
}
