import { dirname, relative, resolve } from 'node:path';
import { loadTypeScriptApi } from './compiler-runtime.js';

/**
 * @param {string} spec
 * @returns {boolean}
 */
function isRelativeSpecifier(spec) {
    return spec.startsWith('./') || spec.startsWith('../');
}

function rebaseRelativeSpecifier(spec, fromFile, toFile) {
    if (!isRelativeSpecifier(spec)) {
        return spec;
    }
    const absoluteTarget = resolve(dirname(fromFile), spec);
    let rebased = relative(dirname(toFile), absoluteTarget).replaceAll('\\', '/');
    if (!rebased.startsWith('.')) {
        rebased = `./${rebased}`;
    }
    return rebased;
}

/**
 * @param {string} line
 * @param {string} oldSpec
 * @param {string} newSpec
 * @returns {string}
 */
function replaceImportSpecifierLiteral(line, oldSpec, newSpec) {
    const single = `'${oldSpec}'`;
    if (line.includes(single)) {
        return line.replace(single, `'${newSpec}'`);
    }

    const dbl = `"${oldSpec}"`;
    if (line.includes(dbl)) {
        return line.replace(dbl, `"${newSpec}"`);
    }
    return line;
}

export function rewriteStaticImportLine(line, fromFile, toFile) {
    const match = line.match(/^\s*import(?:\s+[^'"]+?\s+from)?\s*['"]([^'"]+)['"]\s*;?\s*$/);
    if (!match) {
        return line;
    }
    const spec = match[1];
    if (!isRelativeSpecifier(spec)) {
        return line;
    }
    const rebased = rebaseRelativeSpecifier(spec, fromFile, toFile);
    return replaceImportSpecifierLiteral(line, spec, rebased);
}

/**
 * @param {string} line
 * @returns {string | null}
 */
export function extractStaticImportSpecifier(line) {
    const match = line.match(/^\s*import(?:\s+[^'"]+?\s+from)?\s*['"]([^'"]+)['"]\s*;?\s*$/);
    return match ? match[1] : null;
}

/**
 * @param {string} spec
 * @returns {boolean}
 */
export function isCssSpecifier(spec) {
    return /\.css(?:[?#].*)?$/i.test(spec);
}

/**
 * @param {string} source
 * @param {string} fromFile
 * @param {string} toFile
 * @returns {string}
 */
export function rewriteStaticImportsInSource(source, fromFile, toFile) {
    return source.replace(
        /(^\s*import(?:\s+[^'"]+?\s+from)?\s*['"])([^'"]+)(['"]\s*;?\s*$)/gm,
        (_full, prefix, spec, suffix) => `${prefix}${rebaseRelativeSpecifier(spec, fromFile, toFile)}${suffix}`
    );
}

/**
 * @param {string} source
 * @param {string} sourceFile
 * @param {object | null} [transformCache]
 * @param {Record<string, number> | null} [mergeMetrics]
 * @returns {string}
 */
export function transpileTypeScriptToJs(source, sourceFile, transformCache = null, mergeMetrics = null) {
    const cacheKey = transformCache?.transpileToJs instanceof Map
        ? `${sourceFile}\u0000${source}`
        : null;
    if (cacheKey && transformCache.transpileToJs.has(cacheKey)) {
        if (mergeMetrics && typeof mergeMetrics === 'object') {
            mergeMetrics.codeTranspileCacheHits = (mergeMetrics.codeTranspileCacheHits || 0) + 1;
        }
        return transformCache.transpileToJs.get(cacheKey);
    }

    const ts = loadTypeScriptApi();
    if (!ts) {
        return source;
    }

    try {
        const output = ts.transpileModule(source, {
            fileName: sourceFile,
            compilerOptions: {
                module: ts.ModuleKind.ESNext,
                target: ts.ScriptTarget.ES5,
                importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Preserve,
                verbatimModuleSyntax: true,
                newLine: ts.NewLineKind.LineFeed,
            },
            reportDiagnostics: false,
        });
        const transpiled = output.outputText;
        if (mergeMetrics && typeof mergeMetrics === 'object') {
            if (transpiled === source) {
                mergeMetrics.codeTranspileExactNoopCount = (mergeMetrics.codeTranspileExactNoopCount || 0) + 1;
            } else if (transpiled.trim() === String(source).trim()) {
                mergeMetrics.codeTranspileTrimmedNoopCount = (mergeMetrics.codeTranspileTrimmedNoopCount || 0) + 1;
            } else {
                mergeMetrics.codeTranspileChangedOutputCount = (mergeMetrics.codeTranspileChangedOutputCount || 0) + 1;
            }
        }
        if (cacheKey) {
            transformCache.transpileToJs.set(cacheKey, transpiled);
            if (mergeMetrics && typeof mergeMetrics === 'object') {
                mergeMetrics.codeTranspileCacheMisses = (mergeMetrics.codeTranspileCacheMisses || 0) + 1;
            }
        }
        return transpiled;
    } catch {
        return source;
    }
}

const DEFERRED_RUNTIME_CALLS = new Set(['zenMount', 'zenEffect', 'zeneffect']);

/**
 * @param {string} body
 * @returns {{ hoisted: string, deferred: string }}
 */
function splitDeferredRuntimeCalls(body) {
    const ts = loadTypeScriptApi();
    if (!ts || typeof body !== 'string' || body.trim().length === 0) {
        return { hoisted: body, deferred: '' };
    }

    let sourceFile;
    try {
        sourceFile = ts.createSourceFile(
            'zenith-component-runtime.ts',
            body,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS
        );
    } catch {
        return { hoisted: body, deferred: '' };
    }

    if (!sourceFile || !Array.isArray(sourceFile.statements) || sourceFile.statements.length === 0) {
        return { hoisted: body, deferred: '' };
    }

    const ranges = [];
    for (const statement of sourceFile.statements) {
        if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) {
            continue;
        }

        let callee = statement.expression.expression;
        while (ts.isParenthesizedExpression(callee)) {
            callee = callee.expression;
        }
        if (!ts.isIdentifier(callee) || !DEFERRED_RUNTIME_CALLS.has(callee.text)) {
            continue;
        }

        const start = typeof statement.getFullStart === 'function' ? statement.getFullStart() : statement.pos;
        const end = statement.end;
        if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
            continue;
        }
        ranges.push({ start, end });
    }

    if (ranges.length === 0) {
        return { hoisted: body, deferred: '' };
    }

    ranges.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const range of ranges) {
        const last = merged[merged.length - 1];
        if (!last || range.start > last.end) {
            merged.push({ start: range.start, end: range.end });
            continue;
        }
        if (range.end > last.end) {
            last.end = range.end;
        }
    }

    let cursor = 0;
    let hoisted = '';
    let deferred = '';
    for (const range of merged) {
        if (range.start > cursor) {
            hoisted += body.slice(cursor, range.start);
        }
        deferred += body.slice(range.start, range.end);
        if (!deferred.endsWith('\n')) {
            deferred += '\n';
        }
        cursor = range.end;
    }
    if (cursor < body.length) {
        hoisted += body.slice(cursor);
    }

    return { hoisted, deferred };
}

/**
 * @param {string} source
 * @param {Set<string>} seenStaticImports
 * @returns {string}
 */
export function dedupeStaticImportsInSource(source, seenStaticImports) {
    const lines = source.split('\n');
    const kept = [];

    for (const line of lines) {
        const spec = extractStaticImportSpecifier(line);
        if (!spec) {
            kept.push(line);
            continue;
        }

        const key = line.trim();
        if (seenStaticImports.has(key)) {
            continue;
        }
        seenStaticImports.add(key);
        kept.push(line);
    }

    return kept.join('\n');
}

/**
 * @param {string} source
 * @returns {string}
 */
export function stripNonCssStaticImportsInSource(source) {
    const lines = source.split('\n');
    const kept = [];
    for (const line of lines) {
        const spec = extractStaticImportSpecifier(line);
        if (!spec) {
            kept.push(line);
            continue;
        }
        if (isCssSpecifier(spec)) {
            kept.push(line);
        }
    }
    return kept.join('\n');
}

/**
 * @param {string} source
 * @param {object | null} [transformCache]
 * @param {Record<string, number> | null} [mergeMetrics]
 * @returns {string}
 */
export function deferComponentRuntimeBlock(source, transformCache = null, mergeMetrics = null) {
    const cacheKey = transformCache?.deferRuntime instanceof Map ? source : null;
    if (cacheKey && transformCache.deferRuntime.has(cacheKey)) {
        if (mergeMetrics && typeof mergeMetrics === 'object') {
            mergeMetrics.codeDeferRuntimeCacheHits = (mergeMetrics.codeDeferRuntimeCacheHits || 0) + 1;
        }
        return transformCache.deferRuntime.get(cacheKey);
    }

    const lines = source.split('\n');
    const importLines = [];
    const bodyLines = [];
    let inImportPrefix = true;
    for (const line of lines) {
        if (inImportPrefix && extractStaticImportSpecifier(line)) {
            importLines.push(line);
            continue;
        }
        inImportPrefix = false;
        bodyLines.push(line);
    }

    const body = bodyLines.join('\n');
    if (body.trim().length === 0) {
        const output = importLines.join('\n');
        if (cacheKey) {
            transformCache.deferRuntime.set(cacheKey, output);
            if (mergeMetrics && typeof mergeMetrics === 'object') {
                mergeMetrics.codeDeferRuntimeCacheMisses = (mergeMetrics.codeDeferRuntimeCacheMisses || 0) + 1;
            }
        }
        return output;
    }

    const { hoisted, deferred } = splitDeferredRuntimeCalls(body);
    if (deferred.trim().length === 0) {
        const output = [importLines.join('\n').trim(), hoisted.trim()]
            .filter((segment) => segment.length > 0)
            .join('\n');
        if (cacheKey) {
            transformCache.deferRuntime.set(cacheKey, output);
            if (mergeMetrics && typeof mergeMetrics === 'object') {
                mergeMetrics.codeDeferRuntimeCacheMisses = (mergeMetrics.codeDeferRuntimeCacheMisses || 0) + 1;
            }
        }
        return output;
    }

    const indentedBody = deferred
        .trim()
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n');
    const wrapped = [
        importLines.join('\n').trim(),
        hoisted.trim(),
        "__zenith_component_bootstraps.push(() => {",
        indentedBody,
        "});"
    ]
        .filter((segment) => segment.length > 0)
        .join('\n');

    if (cacheKey) {
        transformCache.deferRuntime.set(cacheKey, wrapped);
        if (mergeMetrics && typeof mergeMetrics === 'object') {
            mergeMetrics.codeDeferRuntimeCacheMisses = (mergeMetrics.codeDeferRuntimeCacheMisses || 0) + 1;
        }
    }
    return wrapped;
}
