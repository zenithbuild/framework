import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { transpileTypeScriptToJs } from './hoisted-code-transforms.js';
import { expandScopedShorthandPropertiesInSource } from './typescript-expression-utils.js';

const RUNTIME_HELPER_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function stripSpecifierSuffix(specifier) {
    return typeof specifier === 'string' ? specifier.replace(/[?#].*$/, '') : '';
}

function isWithinSourceBoundary(filePath, sourceBoundary) {
    if (!filePath || !sourceBoundary) return false;
    const relativePath = relative(resolve(sourceBoundary), resolve(filePath));
    return relativePath === '' || (
        relativePath !== '..' &&
        !relativePath.startsWith('../') &&
        !relativePath.startsWith('..\\') &&
        !isAbsolute(relativePath)
    );
}

function isFile(candidate) {
    try {
        const st = statSync(candidate, { throwIfNoEntry: false });
        return Boolean(st?.isFile());
    } catch {
        return false;
    }
}

/**
 * Normalizes an absolute path or relative path into a canonical relative module ID ending in .js
 * e.g., /path/to/site/src/components/search/SearchModal.zen -> components/search/SearchModal.js
 *
 * @param {string} filePath
 * @param {string} srcDir
 * @returns {string}
 */
export function getCanonicalModuleId(filePath, srcDir) {
    if (!filePath || !srcDir) {
        return '';
    }
    let rel = filePath;
    if (filePath.startsWith(srcDir) || filePath.startsWith('/')) {
        rel = relative(srcDir, filePath);
    }
    const ext = extname(rel);
    const withoutExt = ext ? rel.slice(0, -ext.length) : rel;
    return withoutExt.replace(/\\/g, '/') + '.js';
}

/**
 * Extracts import specifier from a single static import declaration line.
 *
 * @param {string} line
 * @returns {string|null}
 */
export function extractImportSpecifier(line) {
    if (typeof line !== 'string') return null;
    const match = line.match(/^\s*import(?:\s+[^'"]+?\s+from)?\s*['"]([^'"]+)['"]\s*;?\s*$/);
    return match ? match[1] : null;
}

/**
 * @param {string} spec
 * @returns {boolean}
 */
export function isRelativeSpecifier(spec) {
    return typeof spec === 'string' && (spec.startsWith('./') || spec.startsWith('../'));
}

/**
 * Returns whether a static relative specifier can represent a browser runtime helper.
 * Explicit extensions are authoritative; extensionless specifiers are resolved later.
 *
 * @param {string} spec
 * @returns {boolean}
 */
export function isRelativeRuntimeHelperSpecifier(spec) {
    if (!isRelativeSpecifier(spec)) return false;
    const normalized = stripSpecifierSuffix(spec);
    const extension = extname(normalized).toLowerCase();
    return extension === '' || RUNTIME_HELPER_EXTENSIONS.includes(extension);
}

/**
 * Creates source-aware import records for an array of hoisted import declaration strings.
 *
 * @param {string[]} hoistedImports
 * @param {string} sourceFile
 * @param {string} srcDir
 * @returns {Array<{occurrence_index: number, importer_module_id: string, specifier: string, raw_source: string, resolved_module_id: string|null}>}
 */
export function createSourceImportRecords(hoistedImports, sourceFile, srcDir) {
    const list = Array.isArray(hoistedImports) ? hoistedImports : [];
    const importerModuleId = getCanonicalModuleId(sourceFile, srcDir);
    const records = [];
    for (let i = 0; i < list.length; i++) {
        const line = list[i];
        const spec = extractImportSpecifier(line) || '';
        records.push({
            occurrence_index: i,
            importer_module_id: importerModuleId,
            specifier: spec,
            raw_source: line,
            resolved_module_id: null
        });
    }
    return records;
}

/**
 * Collects relative import specifiers from raw source code.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function collectRelativeSpecifiersFromSource(source) {
    const results = [];
    if (typeof source !== 'string') return results;
    const importRegex = /import(?:\s+[^'"]+?\s+from)?\s*['"](\.[^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(source)) !== null) {
        const spec = match[1];
        if (isRelativeRuntimeHelperSpecifier(spec) && !results.includes(spec)) {
            results.push(spec);
        }
    }
    const reexportRegex = /export(?:\s+[^'"]+?\s+from|\s*\*\s*from)\s*['"](\.[^'"]+)['"]/g;
    while ((match = reexportRegex.exec(source)) !== null) {
        const spec = match[1];
        if (isRelativeRuntimeHelperSpecifier(spec) && !results.includes(spec)) {
            results.push(spec);
        }
    }
    return results;
}

/**
 * Resolves a relative import specifier against a base directory to an existing file on disk.
 *
 * @param {string} specifier
 * @param {string} baseDir
 * @param {string} sourceBoundary
 * @returns {string|null}
 */
export function resolveRelativeSpecifierToFile(specifier, baseDir, sourceBoundary) {
    if (!isRelativeRuntimeHelperSpecifier(specifier) || !baseDir || !sourceBoundary) {
        return null;
    }
    const normalizedSpecifier = stripSpecifierSuffix(specifier);
    const targetPath = resolve(baseDir, normalizedSpecifier);
    const explicitExtension = extname(normalizedSpecifier).toLowerCase();
    if (explicitExtension) {
        return isWithinSourceBoundary(targetPath, sourceBoundary) && isFile(targetPath)
            ? targetPath
            : null;
    }

    for (const ext of RUNTIME_HELPER_EXTENSIONS) {
        const candidate = targetPath + ext;
        if (isWithinSourceBoundary(candidate, sourceBoundary) && isFile(candidate)) {
            return candidate;
        }
    }
    for (const ext of RUNTIME_HELPER_EXTENSIONS) {
        const candidateIndex = resolve(targetPath, `index${ext}`);
        if (isWithinSourceBoundary(candidateIndex, sourceBoundary) && isFile(candidateIndex)) {
            return candidateIndex;
        }
    }
    return null;
}

/**
 * Main helper discovery and transpilation engine using structured import records.
 *
 * @param {object} pageIr
 * @param {string} sourceFile
 * @param {string} srcDir
 * @param {object|null} [transformCache]
 * @param {Record<string, number>|null} [mergeMetrics]
 */
export function synthesizeAndResolveHelperModules(
    pageIr,
    sourceFile,
    srcDir,
    transformCache = null,
    mergeMetrics = null
) {
    if (!pageIr || typeof sourceFile !== 'string' || typeof srcDir !== 'string') {
        return;
    }

    const pageModuleId = getCanonicalModuleId(sourceFile, srcDir);
    pageIr.page_module_id = pageModuleId;

    if (!Array.isArray(pageIr.import_records)) {
        pageIr.import_records = createSourceImportRecords(pageIr.hoisted?.imports || [], sourceFile, srcDir);
    }

    pageIr.modules = Array.isArray(pageIr.modules) ? pageIr.modules : [];

    const pending = [];
    const seenPaths = new Set();

    function enqueueHelper(absolutePath) {
        if (!absolutePath || seenPaths.has(absolutePath)) return;
        seenPaths.add(absolutePath);
        pending.push(absolutePath);
    }

    for (const record of pageIr.import_records) {
        if (!record || typeof record !== 'object') continue;
        const spec = record.specifier;
        if (!isRelativeRuntimeHelperSpecifier(spec)) {
            continue;
        }

        const importerModuleId = record.importer_module_id;
        if (!importerModuleId || typeof importerModuleId !== 'string') {
            throw new Error(
                `ERROR: Emission failed - cannot resolve relative helper import because importer provenance was lost.\n` +
                `  Specifier: ${spec}\n` +
                `  Page: ${pageModuleId}`
            );
        }

        const importerAbsDir = dirname(resolve(srcDir, importerModuleId));
        const absoluteHelperPath = resolveRelativeSpecifierToFile(spec, importerAbsDir, srcDir);

        if (absoluteHelperPath) {
            const targetModuleId = getCanonicalModuleId(absoluteHelperPath, srcDir);
            record.resolved_module_id = targetModuleId;
            enqueueHelper(absoluteHelperPath);
        } else {
            throw new Error(
                `ERROR: Emission failed - unresolved page import\n` +
                `  unresolved_specifier: ${spec}\n` +
                `  importer: ${importerModuleId}\n` +
                `  page: ${pageModuleId}`
            );
        }
    }

    while (pending.length > 0) {
        const absolutePath = pending.shift();
        let rawSource;
        try {
            rawSource = readFileSync(absolutePath, 'utf8');
        } catch {
            continue;
        }

        const expanded = expandScopedShorthandPropertiesInSource(rawSource);
        const transpiled = transpileTypeScriptToJs(
            expanded,
            absolutePath,
            transformCache,
            mergeMetrics,
            { target: 'esnext' }
        );

        const id = getCanonicalModuleId(absolutePath, srcDir);
        const deps = [];
        const baseDir = dirname(absolutePath);

        for (const spec of collectRelativeSpecifiersFromSource(rawSource)) {
            const absoluteDep = resolveRelativeSpecifierToFile(spec, baseDir, srcDir);
            if (absoluteDep) {
                const depId = getCanonicalModuleId(absoluteDep, srcDir);
                if (!deps.includes(depId)) {
                    deps.push(depId);
                }
                enqueueHelper(absoluteDep);
            }
        }

        if (!pageIr.modules.some((m) => m.id === id)) {
            pageIr.modules.push({ id, source: transpiled, deps });
        }
    }
}
