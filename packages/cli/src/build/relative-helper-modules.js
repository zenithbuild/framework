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

export function getCanonicalModuleId(filePath, srcDir) {
    if (!filePath || !srcDir) return '';
    let rel = filePath;
    if (filePath.startsWith(srcDir) || filePath.startsWith('/')) {
        rel = relative(srcDir, filePath);
    }
    const ext = extname(rel);
    const withoutExt = ext ? rel.slice(0, -ext.length) : rel;
    return withoutExt.replace(/\\/g, '/') + '.js';
}

export function extractImportSpecifier(line) {
    if (typeof line !== 'string') return null;
    const match = line.match(/^\s*import(?:\s+[^'"]+?\s+from)?\s*['"]([^'"]+)['"]\s*;?\s*$/);
    return match ? match[1] : null;
}

export function isRelativeSpecifier(spec) {
    return typeof spec === 'string' && (spec.startsWith('./') || spec.startsWith('../'));
}

export function isRelativeRuntimeHelperSpecifier(spec) {
    if (!isRelativeSpecifier(spec)) return false;
    const normalized = stripSpecifierSuffix(spec);
    const extension = extname(normalized).toLowerCase();
    return extension === '' || RUNTIME_HELPER_EXTENSIONS.includes(extension);
}

export function createSourceImportRecords(hoistedImports, sourceFile, srcDir) {
    const list = Array.isArray(hoistedImports) ? hoistedImports : [];
    const importerModuleId = getCanonicalModuleId(sourceFile, srcDir);
    return list.map((line, occurrenceIndex) => ({
        occurrence_index: occurrenceIndex,
        importer_module_id: importerModuleId,
        specifier: extractImportSpecifier(line) || '',
        raw_source: line,
        resolved_module_id: null
    }));
}

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
    return results;
}

export function resolveRelativeSpecifierToFile(specifier, baseDir, sourceBoundary) {
    if (!isRelativeRuntimeHelperSpecifier(specifier) || !baseDir || !sourceBoundary) return null;
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
        if (isWithinSourceBoundary(candidate, sourceBoundary) && isFile(candidate)) return candidate;
    }
    for (const ext of RUNTIME_HELPER_EXTENSIONS) {
        const candidate = resolve(targetPath, `index${ext}`);
        if (isWithinSourceBoundary(candidate, sourceBoundary) && isFile(candidate)) return candidate;
    }
    return null;
}

export function synthesizeLegacyHelperModules(
    pageIr,
    sourceFile,
    srcDir,
    transformCache = null,
    mergeMetrics = null
) {
    if (!pageIr || typeof sourceFile !== 'string' || typeof srcDir !== 'string') return;
    const pageDir = dirname(sourceFile);
    const pending = [];
    const seenPaths = new Set();

    function enqueueHelper(absolutePath) {
        if (!absolutePath || seenPaths.has(absolutePath)) return;
        seenPaths.add(absolutePath);
        pending.push(absolutePath);
    }

    function scanForHelpers(source, baseDir) {
        for (const spec of collectRelativeSpecifiersFromSource(source)) {
            enqueueHelper(resolveRelativeSpecifierToFile(spec, baseDir, srcDir));
        }
    }

    for (const imp of Array.isArray(pageIr?.hoisted?.imports) ? pageIr.hoisted.imports : []) {
        scanForHelpers(imp, pageDir);
    }
    for (const block of Array.isArray(pageIr?.hoisted?.code) ? pageIr.hoisted.code : []) {
        scanForHelpers(block, pageDir);
    }
    for (const imp of Array.isArray(pageIr?.imports) ? pageIr.imports : []) {
        if (imp && typeof imp.spec === 'string') scanForHelpers(imp.spec, pageDir);
    }
    for (const script of Object.values(pageIr?.components_scripts || {})) {
        if (!script || typeof script !== 'object') continue;
        for (const imp of Array.isArray(script.imports) ? script.imports : []) {
            scanForHelpers(imp, pageDir);
        }
        if (typeof script.code === 'string') scanForHelpers(script.code, pageDir);
    }

    pageIr.modules = Array.isArray(pageIr.modules) ? pageIr.modules : [];
    while (pending.length > 0) {
        const absolutePath = pending.shift();
        let rawSource;
        try {
            rawSource = readFileSync(absolutePath, 'utf8');
        } catch {
            continue;
        }
        scanForHelpers(rawSource, dirname(absolutePath));
        const transpiled = transpileTypeScriptToJs(
            expandScopedShorthandPropertiesInSource(rawSource),
            absolutePath,
            transformCache,
            mergeMetrics,
            { target: 'esnext' }
        );
        const id = getCanonicalModuleId(absolutePath, srcDir);
        const deps = collectRelativeSpecifiersFromSource(rawSource)
            .map((spec) => resolveRelativeSpecifierToFile(spec, dirname(absolutePath), srcDir))
            .filter(Boolean)
            .map((absoluteDep) => getCanonicalModuleId(absoluteDep, srcDir));
        if (!pageIr.modules.some((module) => module.id === id)) {
            pageIr.modules.push({ id, source: transpiled, deps: [...new Set(deps)] });
        }
    }
}
