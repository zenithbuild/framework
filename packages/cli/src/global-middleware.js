import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';

const PACKAGE_REQUIRE = createRequire(import.meta.url);
const STATIC_MIDDLEWARE_TARGETS = new Set([
    'static',
    'static-export',
    'vercel-static',
    'netlify-static'
]);

function toPosixRelative(from, to) {
    const relativePath = relative(from, to).replaceAll('\\', '/');
    return relativePath || '.';
}

function middlewareError(sourceFile, message) {
    return new Error(`[Zenith:Middleware] Invalid global middleware in ${sourceFile}: ${message}`);
}

function resolveTypeScriptApi(projectRoot) {
    try {
        const projectRequire = createRequire(join(projectRoot, '__zenith_middleware_parser__.js'));
        return projectRequire('typescript');
    } catch {
        try {
            return PACKAGE_REQUIRE('typescript');
        } catch {
            throw new Error(
                '[Zenith:Middleware] Global middleware validation requires the `typescript` package to be installed.'
            );
        }
    }
}

function hasModifier(ts, node, kind) {
    return Boolean(node?.modifiers?.some((modifier) => modifier.kind === kind));
}

function isAllowedTypeOnlyNamedExport(ts, node) {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
        return hasModifier(ts, node, ts.SyntaxKind.ExportKeyword)
            && !hasModifier(ts, node, ts.SyntaxKind.DefaultKeyword);
    }

    if (ts.isExportDeclaration(node)) {
        if (node.isTypeOnly) {
            return true;
        }
        const elements = node.exportClause && ts.isNamedExports(node.exportClause)
            ? node.exportClause.elements
            : [];
        return elements.length > 0 && elements.every((specifier) => specifier.isTypeOnly === true);
    }

    return false;
}

function unwrapExpression(ts, expression) {
    let current = expression;
    while (current && ts.isParenthesizedExpression(current)) {
        current = current.expression;
    }
    return current;
}

function isFunctionLikeDefault(ts, expression) {
    const unwrapped = unwrapExpression(ts, expression);
    return ts.isFunctionExpression(unwrapped) || ts.isArrowFunction(unwrapped)
        ? unwrapped
        : null;
}

function propertyAccessPath(ts, node) {
    const parts = [];
    let current = node;
    while (current && ts.isPropertyAccessExpression(current)) {
        parts.unshift(current.name.text);
        current = current.expression;
    }
    if (current && ts.isIdentifier(current)) {
        parts.unshift(current.text);
    }
    return parts;
}

function hasCommonJsExport(ts, node) {
    let found = false;

    function visit(current) {
        if (found) {
            return;
        }
        if (
            ts.isBinaryExpression(current)
            && current.operatorToken.kind === ts.SyntaxKind.EqualsToken
            && ts.isPropertyAccessExpression(current.left)
        ) {
            const parts = propertyAccessPath(ts, current.left);
            if (parts[0] === 'module' && parts[1] === 'exports') {
                found = true;
                return;
            }
            if (parts[0] === 'exports') {
                found = true;
                return;
            }
        }
        ts.forEachChild(current, visit);
    }

    ts.forEachChild(node, visit);
    return found;
}

function assertTwoNonRestParams(fn, sourceFile) {
    const params = Array.isArray(fn?.parameters) ? fn.parameters : [];
    const hasRest = params.some((param) => param.dotDotDotToken);
    if (params.length !== 2 || hasRest) {
        throw middlewareError(
            sourceFile,
            'default function must accept exactly two arguments: ctx and next.'
        );
    }
}

export function validateGlobalMiddlewareSource(source, sourceFile, projectRoot = process.cwd()) {
    const ts = resolveTypeScriptApi(projectRoot);
    const parsed = ts.createSourceFile(
        sourceFile,
        String(source || ''),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );

    if (parsed.parseDiagnostics.length > 0) {
        throw middlewareError(sourceFile, 'unable to parse middleware module.');
    }
    if (hasCommonJsExport(ts, parsed)) {
        throw middlewareError(
            sourceFile,
            'CommonJS middleware exports are not supported. Use `export default function middleware(ctx, next) { ... }`.'
        );
    }

    let defaultExportCount = 0;
    let defaultFunction = null;
    let defaultExportWasNonFunction = false;
    let hasNamedRuntimeExport = false;

    for (const statement of parsed.statements) {
        if (ts.isExportDeclaration(statement)) {
            if (!isAllowedTypeOnlyNamedExport(ts, statement)) {
                hasNamedRuntimeExport = true;
            }
            continue;
        }

        if (ts.isExportAssignment(statement)) {
            if (statement.isExportEquals) {
                throw middlewareError(
                    sourceFile,
                    'CommonJS middleware exports are not supported. Use `export default function middleware(ctx, next) { ... }`.'
                );
            }
            defaultExportCount += 1;
            const fn = isFunctionLikeDefault(ts, statement.expression);
            if (fn) {
                defaultFunction = fn;
            } else {
                defaultExportWasNonFunction = true;
            }
            continue;
        }

        const hasExport = hasModifier(ts, statement, ts.SyntaxKind.ExportKeyword);
        if (!hasExport) {
            continue;
        }

        const hasDefault = hasModifier(ts, statement, ts.SyntaxKind.DefaultKeyword);
        if (hasDefault) {
            defaultExportCount += 1;
            if (ts.isFunctionDeclaration(statement)) {
                defaultFunction = statement;
            } else {
                defaultExportWasNonFunction = true;
            }
            continue;
        }

        if (!isAllowedTypeOnlyNamedExport(ts, statement)) {
            hasNamedRuntimeExport = true;
        }
    }

    if (hasNamedRuntimeExport) {
        throw middlewareError(
            sourceFile,
            'named runtime exports are not supported. Export only `default function middleware(ctx, next)`.'
        );
    }
    if (defaultExportCount !== 1) {
        throw middlewareError(sourceFile, 'expected exactly one default export function.');
    }
    if (!defaultFunction || defaultExportWasNonFunction) {
        throw middlewareError(
            sourceFile,
            'default export must be a function. Use `export default function middleware(ctx, next) { ... }`.'
        );
    }

    assertTwoNonRestParams(defaultFunction, sourceFile);
}

async function findNestedMiddlewareFiles(dir, projectRoot) {
    const matches = [];
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return matches;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'middleware' && existsSync(join(fullPath, 'index.ts'))) {
                matches.push(join(fullPath, 'index.ts'));
            }
            matches.push(...await findNestedMiddlewareFiles(fullPath, projectRoot));
            continue;
        }
        if (entry.isFile() && entry.name === 'middleware.ts') {
            matches.push(fullPath);
        }
    }

    return matches.sort((left, right) => (
        toPosixRelative(projectRoot, left).localeCompare(toPosixRelative(projectRoot, right))
    ));
}

function createMetadata(sourceFile) {
    return { source_file: sourceFile };
}

export function normalizeGlobalMiddlewareMetadata(globalMiddleware) {
    const sourceFile = typeof globalMiddleware?.source_file === 'string'
        ? globalMiddleware.source_file
        : typeof globalMiddleware?.sourceFile === 'string'
            ? globalMiddleware.sourceFile
            : null;
    return sourceFile ? createMetadata(sourceFile) : null;
}

export function assertGlobalMiddlewareTargetSupported(target, globalMiddleware) {
    if (!globalMiddleware || !STATIC_MIDDLEWARE_TARGETS.has(target)) {
        return;
    }
    throw new Error(
        `[Zenith:Middleware] target "${target}" cannot use global middleware. ` +
        'Global middleware requires a server-capable target ("node", "vercel", or "netlify"). ' +
        `File: ${globalMiddleware.sourceFile}.`
    );
}

export async function resolveGlobalMiddleware({ projectRoot, pagesDir, target } = {}) {
    const resolvedProjectRoot = resolve(projectRoot || process.cwd());
    const resolvedPagesDir = resolve(resolvedProjectRoot, pagesDir || 'pages');
    const middlewareRoot = dirname(resolvedPagesDir);
    const rootCandidates = [
        join(middlewareRoot, 'middleware.ts'),
        join(middlewareRoot, 'middleware', 'index.ts')
    ].filter((candidate) => existsSync(candidate));

    if (rootCandidates.length > 1) {
        throw new Error(
            `[Zenith:Middleware] Multiple global middleware files found in "${middlewareRoot}". ` +
            'Keep exactly one of: middleware.ts, middleware/index.ts.'
        );
    }

    const nestedMatches = await findNestedMiddlewareFiles(resolvedPagesDir, resolvedProjectRoot);
    if (nestedMatches.length > 0) {
        const relativePath = toPosixRelative(resolvedProjectRoot, nestedMatches[0]);
        const middlewareRootRelative = toPosixRelative(resolvedProjectRoot, middlewareRoot);
        const targetPath = middlewareRootRelative === '.'
            ? 'middleware.ts'
            : `${middlewareRootRelative}/middleware.ts`;
        throw new Error(
            '[Zenith:Middleware] Nested middleware files are not supported in V1. ' +
            `Move "${relativePath}" to "${targetPath}" or remove it.`
        );
    }

    if (rootCandidates.length === 0) {
        return null;
    }

    const sourcePath = rootCandidates[0];
    const sourceFile = toPosixRelative(resolvedProjectRoot, sourcePath);
    const globalMiddleware = {
        sourcePath,
        sourceFile,
        root: middlewareRoot,
        metadata: createMetadata(sourceFile)
    };

    assertGlobalMiddlewareTargetSupported(target, globalMiddleware);
    validateGlobalMiddlewareSource(await readFile(sourcePath, 'utf8'), sourceFile, resolvedProjectRoot);
    return globalMiddleware;
}
