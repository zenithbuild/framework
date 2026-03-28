import { readFileSync } from 'node:fs';
import { findNextKnownComponentTag } from '../component-tag-parser.js';

/**
 * @param {string} source
 * @param {string} sourceFile
 * @param {object} [compilerOpts]
 * @returns {{ source: string, serverScript: { source: string, prerender: boolean, has_guard: boolean, has_load: boolean, has_action: boolean, source_path: string } | null }}
 */
export function extractServerScript(source, sourceFile, compilerOpts = {}) {
    const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    const serverMatches = [];
    const reservedServerExportRe =
        /\bexport\s+const\s+(?:data|prerender|guard|load|action|ssr_data|props|ssr)\b|\bexport\s+(?:async\s+)?function\s+(?:load|guard|action)\s*\(|\bexport\s+const\s+(?:load|guard|action)\s*=/;

    for (const match of source.matchAll(scriptRe)) {
        const attrs = String(match[1] || '');
        const body = String(match[2] || '');
        const isServer = /\bserver\b/i.test(attrs);

        if (!isServer && reservedServerExportRe.test(body)) {
            throw new Error(
                `Zenith server script contract violation:\n` +
                `  File: ${sourceFile}\n` +
                `  Reason: guard/load/action/data exports are only allowed in <script server lang="ts"> or adjacent .guard.ts / .load.ts / .action.ts files\n` +
                `  Example: move the export into <script server lang="ts">`
            );
        }

        if (isServer) {
            serverMatches.push(match);
        }
    }

    if (serverMatches.length === 0) {
        return { source, serverScript: null };
    }

    if (serverMatches.length > 1) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: multiple <script server> blocks are not supported\n` +
            `  Example: keep exactly one <script server>...</script> block`
        );
    }

    const match = serverMatches[0];
    const full = match[0] || '';
    const attrs = String(match[1] || '');
    const hasLangTs = /\blang\s*=\s*["']ts["']/i.test(attrs);
    const hasLangJs = /\blang\s*=\s*["'](?:js|javascript)["']/i.test(attrs);
    const hasAnyLang = /\blang\s*=/i.test(attrs);
    const isTypescriptDefault = compilerOpts && compilerOpts.typescriptDefault === true;

    if (!hasLangTs) {
        if (!isTypescriptDefault || hasLangJs || hasAnyLang) {
            throw new Error(
                `Zenith server script contract violation:\n` +
                `  File: ${sourceFile}\n` +
                `  Reason: Zenith requires TypeScript server scripts. Add lang="ts" (or enable typescriptDefault).\n` +
                `  Example: <script server lang="ts">`
            );
        }
    }

    const serverSource = String(match[2] || '').trim();
    if (!serverSource) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: <script server> block is empty\n` +
            `  Example: export const data = { ... }`
        );
    }

    const loadFnMatch = serverSource.match(/\bexport\s+(?:async\s+)?function\s+load\s*\(([^)]*)\)/);
    const loadConstParenMatch = serverSource.match(/\bexport\s+const\s+load\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/);
    const loadConstSingleArgMatch = serverSource.match(
        /\bexport\s+const\s+load\s*=\s*(?:async\s*)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/
    );
    const hasLoad = Boolean(loadFnMatch || loadConstParenMatch || loadConstSingleArgMatch);
    const loadMatchCount =
        Number(Boolean(loadFnMatch)) +
        Number(Boolean(loadConstParenMatch)) +
        Number(Boolean(loadConstSingleArgMatch));
    if (loadMatchCount > 1) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: multiple load exports detected\n` +
            `  Example: keep exactly one export const load = async (ctx) => ({ ... })`
        );
    }

    const guardFnMatch = serverSource.match(/\bexport\s+(?:async\s+)?function\s+guard\s*\(([^)]*)\)/);
    const guardConstParenMatch = serverSource.match(/\bexport\s+const\s+guard\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/);
    const guardConstSingleArgMatch = serverSource.match(
        /\bexport\s+const\s+guard\s*=\s*(?:async\s*)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/
    );
    const hasGuard = Boolean(guardFnMatch || guardConstParenMatch || guardConstSingleArgMatch);
    const guardMatchCount =
        Number(Boolean(guardFnMatch)) +
        Number(Boolean(guardConstParenMatch)) +
        Number(Boolean(guardConstSingleArgMatch));
    if (guardMatchCount > 1) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: multiple guard exports detected\n` +
            `  Example: keep exactly one export const guard = async (ctx) => ({ ... })`
        );
    }

    const actionFnMatch = serverSource.match(/\bexport\s+(?:async\s+)?function\s+action\s*\(([^)]*)\)/);
    const actionConstParenMatch = serverSource.match(/\bexport\s+const\s+action\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/);
    const actionConstSingleArgMatch = serverSource.match(
        /\bexport\s+const\s+action\s*=\s*(?:async\s*)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/
    );
    const hasAction = Boolean(actionFnMatch || actionConstParenMatch || actionConstSingleArgMatch);
    const actionMatchCount =
        Number(Boolean(actionFnMatch)) +
        Number(Boolean(actionConstParenMatch)) +
        Number(Boolean(actionConstSingleArgMatch));
    if (actionMatchCount > 1) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: multiple action exports detected\n` +
            `  Example: keep exactly one export const action = async (ctx) => ({ ... })`
        );
    }

    const hasData = /\bexport\s+const\s+data\b/.test(serverSource);
    const hasSsrData = /\bexport\s+const\s+ssr_data\b/.test(serverSource);
    const hasSsr = /\bexport\s+const\s+ssr\b/.test(serverSource);
    const hasProps = /\bexport\s+const\s+props\b/.test(serverSource);

    if (hasData && hasLoad) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: export either data or load(ctx), not both\n` +
            `  Example: remove data and return payload from load(ctx)`
        );
    }
    if ((hasData || hasLoad) && (hasSsrData || hasSsr || hasProps)) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: data/load cannot be combined with legacy ssr_data/ssr/props exports\n` +
            `  Example: use only export const data or export const load`
        );
    }

    if (hasLoad) {
        const singleArg = String(loadConstSingleArgMatch?.[1] || '').trim();
        const paramsText = String((loadFnMatch || loadConstParenMatch)?.[1] || '').trim();
        const arity = singleArg ? 1 : paramsText.length === 0 ? 0 : paramsText.split(',').length;
        if (arity !== 1) {
            throw new Error(
                `Zenith server script contract violation:\n` +
                `  File: ${sourceFile}\n` +
                `  Reason: load(ctx) must accept exactly one argument\n` +
                `  Example: export const load = async (ctx) => ({ ... })`
            );
        }
    }

    if (hasGuard) {
        const singleArg = String(guardConstSingleArgMatch?.[1] || '').trim();
        const paramsText = String((guardFnMatch || guardConstParenMatch)?.[1] || '').trim();
        const arity = singleArg ? 1 : paramsText.length === 0 ? 0 : paramsText.split(',').length;
        if (arity !== 1) {
            throw new Error(
                `Zenith server script contract violation:\n` +
                `  File: ${sourceFile}\n` +
                `  Reason: guard(ctx) must accept exactly one argument\n` +
                `  Example: export const guard = async (ctx) => ({ ... })`
            );
        }
    }

    if (hasAction) {
        const singleArg = String(actionConstSingleArgMatch?.[1] || '').trim();
        const paramsText = String((actionFnMatch || actionConstParenMatch)?.[1] || '').trim();
        const arity = singleArg ? 1 : paramsText.length === 0 ? 0 : paramsText.split(',').length;
        if (arity !== 1) {
            throw new Error(
                `Zenith server script contract violation:\n` +
                `  File: ${sourceFile}\n` +
                `  Reason: action(ctx) must accept exactly one argument\n` +
                `  Example: export const action = async (ctx) => ({ ... })`
            );
        }
    }

    const prerenderMatch = serverSource.match(/\bexport\s+const\s+prerender\s*=\s*([^\n;]+)/);
    let prerender = false;
    if (prerenderMatch) {
        const rawValue = String(prerenderMatch[1] || '').trim();
        if (!/^(true|false)\b/.test(rawValue)) {
            throw new Error(
                `Zenith server script contract violation:\n` +
                `  File: ${sourceFile}\n` +
                `  Reason: prerender must be a boolean literal\n` +
                `  Example: export const prerender = true`
            );
        }
        prerender = rawValue.startsWith('true');
    }

    const start = match.index ?? -1;
    if (start < 0) {
        return {
            source,
            serverScript: {
                source: serverSource,
                prerender,
                has_guard: hasGuard,
                has_load: hasLoad,
                has_action: hasAction,
                source_path: sourceFile
            }
        };
    }

    const end = start + full.length;
    const stripped = `${source.slice(0, start)}${source.slice(end)}`;
    return {
        source: stripped,
        serverScript: {
            source: serverSource,
            prerender,
            has_guard: hasGuard,
            has_load: hasLoad,
            has_action: hasAction,
            source_path: sourceFile
        }
    };
}

/**
 * @param {string} source
 * @param {Map<string, string>} registry
 * @param {string | null} [ownerPath]
 * @returns {Map<string, Array<{ attrs: string, ownerPath: string | null }>>}
 */
export function collectComponentUsageAttrs(source, registry, ownerPath = null) {
    const out = new Map();
    let cursor = 0;
    while (cursor < source.length) {
        const tag = findNextKnownComponentTag(source, registry, cursor);
        if (!tag) {
            break;
        }
        const name = tag.name;
        const attrs = String(tag.attrs || '').trim();
        if (!out.has(name)) {
            out.set(name, []);
        }
        out.get(name).push({ attrs, ownerPath });
        cursor = tag.end;
    }
    return out;
}

/**
 * @param {string} source
 * @param {Map<string, string>} registry
 * @param {string | null} [ownerPath]
 * @param {Set<string>} [visitedFiles]
 * @param {Map<string, Array<{ attrs: string, ownerPath: string | null }>>} [out]
 * @returns {Map<string, Array<{ attrs: string, ownerPath: string | null }>>}
 */
export function collectRecursiveComponentUsageAttrs(
    source,
    registry,
    ownerPath = null,
    visitedFiles = new Set(),
    out = new Map()
) {
    const local = collectComponentUsageAttrs(source, registry, ownerPath);
    for (const [name, attrsList] of local.entries()) {
        if (!out.has(name)) {
            out.set(name, []);
        }
        out.get(name).push(...attrsList);
    }

    for (const name of local.keys()) {
        const compPath = registry.get(name);
        if (!compPath || visitedFiles.has(compPath)) {
            continue;
        }
        visitedFiles.add(compPath);
        const componentSource = readFileSync(compPath, 'utf8');
        collectRecursiveComponentUsageAttrs(componentSource, registry, compPath, visitedFiles, out);
    }

    return out;
}
