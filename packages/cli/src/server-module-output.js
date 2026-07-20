import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_REQUIRE = createRequire(import.meta.url);
const RELATIVE_SPECIFIER_RE = /((?:import|export)\s+(?:[^'"]*?\s+from\s+)?|import\s*\()\s*(['"])([^'"]+)\2/g;
const IMPORT_META_ASSET_RE = /new\s+URL\s*\(\s*(['"])(\.\.?\/[^'"]+)\1\s*,\s*import\.meta\.url\s*\)/g;
const SPECIAL_SERVER_SPECIFIERS = new Map([
    ['zenith:server-contract', 'server-contract.js'],
    ['zenith:route-auth', 'auth/route-auth.js']
]);
const SERVER_MODULE_EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json'
]);

function resolveTypeScriptApi(projectRoot) {
    try {
        const projectRequire = createRequire(join(projectRoot, '__zenith_server_output_loader__.js'));
        return projectRequire('typescript');
    } catch {
        try {
            return PACKAGE_REQUIRE('typescript');
        } catch {
            throw new Error(
                '[Zenith:Build] Server-capable targets require the `typescript` package to transpile route modules.'
            );
        }
    }
}

function replaceSpecifier(source, original, nextValue) {
    return source.replace(
        new RegExp(`(['"])${escapeRegex(original)}\\1`, 'g'),
        (_, quote) => `${quote}${nextValue}${quote}`
    );
}

function escapeRegex(value) {
    return String(value).replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&');
}

function isRelativeSpecifier(specifier) {
    return (
        specifier.startsWith('./') ||
        specifier.startsWith('../') ||
        specifier.startsWith('/') ||
        specifier.startsWith('file:')
    );
}

function resolveModuleCandidates(basePath) {
    if (extname(basePath)) {
        return [basePath];
    }
    return [
        basePath,
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.mts`,
        `${basePath}.cts`,
        `${basePath}.js`,
        `${basePath}.mjs`,
        `${basePath}.cjs`,
        `${basePath}.json`,
        join(basePath, 'index.ts'),
        join(basePath, 'index.tsx'),
        join(basePath, 'index.mts'),
        join(basePath, 'index.cts'),
        join(basePath, 'index.js'),
        join(basePath, 'index.mjs'),
        join(basePath, 'index.cjs'),
        join(basePath, 'index.json')
    ];
}

function resolveImportedModule(specifier, sourceFile) {
    if (!isRelativeSpecifier(specifier)) {
        return null;
    }
    const baseDir = dirname(sourceFile);
    const basePath = specifier.startsWith('file:')
        ? new URL(specifier)
        : resolve(baseDir, specifier);
    const filePath = basePath instanceof URL ? fileURLToPath(basePath) : basePath;
    const candidates = resolveModuleCandidates(filePath);
    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) {
        throw new Error(`[Zenith:Build] Cannot resolve server import "${specifier}" from "${sourceFile}"`);
    }
    return found;
}

function gatherSpecifiers(source) {
    const results = [];
    for (const match of source.matchAll(RELATIVE_SPECIFIER_RE)) {
        const specifier = String(match[3] || '');
        results.push(specifier);
    }
    return results;
}

function gatherImportMetaAssets(source) {
    return [...new Set([...String(source || '').matchAll(IMPORT_META_ASSET_RE)]
        .map((match) => String(match[2] || ''))
        .filter(Boolean))];
}

function assertServerAssetDestination(serverDir, destinationPath, specifier, sourceFile) {
    const relativeDestination = relative(serverDir, destinationPath);
    if (
        relativeDestination === '..' ||
        relativeDestination.startsWith('../') ||
        relativeDestination.startsWith('..\\') ||
        isAbsolute(relativeDestination)
    ) {
        throw new Error(
            `[Zenith:Build] Server asset "${specifier}" from "${sourceFile}" escapes the server output root.`
        );
    }
}

async function copyImportMetaAssets({ source, sourcePath, outputPath, serverDir }) {
    for (const specifier of gatherImportMetaAssets(source)) {
        const sourceAssetPath = resolve(dirname(sourcePath), specifier);
        if (!existsSync(sourceAssetPath)) {
            continue;
        }
        const outputAssetPath = resolve(dirname(outputPath), specifier);
        assertServerAssetDestination(serverDir, outputAssetPath, specifier, sourcePath);
        await mkdir(dirname(outputAssetPath), { recursive: true });
        await cp(sourceAssetPath, outputAssetPath, { force: true, recursive: true });
    }
}

function transpileSource(ts, source, filePath) {
    return ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true
        },
        fileName: filePath
    }).outputText;
}

function outputPathForSource(projectRoot, modulesRoot, sourcePath) {
    const relativePath = relative(projectRoot, sourcePath).replaceAll('\\', '/');
    const nextRelative = extname(relativePath) === '.json'
        ? relativePath
        : relativePath.replace(/\.(tsx|ts|mts|cts|jsx|js|mjs|cjs)$/i, '.js');
    return join(modulesRoot, nextRelative);
}

function assertSupportedMiddlewareImport(specifier, sourceFile) {
    if (!isRelativeSpecifier(specifier)) {
        return;
    }
    const extension = extname(specifier.startsWith('file:') ? fileURLToPath(new URL(specifier)) : specifier).toLowerCase();
    if (!extension || SERVER_MODULE_EXTENSIONS.has(extension)) {
        return;
    }
    throw new Error(
        `[Zenith:Middleware] Unsupported middleware import "${specifier}" from "${sourceFile}". ` +
        'Global middleware may only import JavaScript, TypeScript, or JSON modules.'
    );
}

function assertSupportedMiddlewareSourcePath(sourcePath, specifier, sourceFile) {
    const extension = extname(sourcePath).toLowerCase();
    if (SERVER_MODULE_EXTENSIONS.has(extension)) {
        return;
    }
    throw new Error(
        `[Zenith:Middleware] Unsupported middleware import "${specifier}" from "${sourceFile}". ` +
        'Global middleware may only import JavaScript, TypeScript, or JSON modules.'
    );
}

function assertLiteralMiddlewareDynamicImports(ts, source, sourceFile) {
    const parsed = ts.createSourceFile(
        sourceFile,
        String(source || ''),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );

    let invalid = false;
    function visit(node) {
        if (invalid) {
            return;
        }
        if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword
        ) {
            const firstArg = node.arguments?.[0];
            if (!firstArg || !ts.isStringLiteralLike(firstArg)) {
                invalid = true;
                return;
            }
        }
        ts.forEachChild(node, visit);
    }
    ts.forEachChild(parsed, visit);
    if (invalid) {
        throw new Error('[Zenith:Middleware] Dynamic middleware imports must use a string literal specifier.');
    }
}

async function compileImportedModule({
    projectRoot,
    modulesRoot,
    serverDir,
    sourcePath,
    sourceSpecifier,
    importerPath,
    ts,
    seen,
    validateMiddlewareImports = false
}) {
    if (seen.has(sourcePath)) {
        return outputPathForSource(projectRoot, modulesRoot, sourcePath);
    }
    seen.add(sourcePath);

    if (validateMiddlewareImports) {
        assertSupportedMiddlewareSourcePath(sourcePath, sourceSpecifier, importerPath);
    }

    const outPath = outputPathForSource(projectRoot, modulesRoot, sourcePath);
    await mkdir(dirname(outPath), { recursive: true });

    if (extname(sourcePath) === '.json') {
        await cp(sourcePath, outPath, { force: true });
        return outPath;
    }

    const source = await readFile(sourcePath, 'utf8');
    await copyImportMetaAssets({
        source,
        sourcePath,
        outputPath: outPath,
        serverDir
    });
    if (validateMiddlewareImports) {
        assertLiteralMiddlewareDynamicImports(ts, source, sourcePath);
    }
    let output = transpileSource(ts, source, sourcePath);
    for (const specifier of gatherSpecifiers(output)) {
        const specialSpecifierPath = SPECIAL_SERVER_SPECIFIERS.get(specifier);
        if (specialSpecifierPath) {
            const nextSpecifier = relative(dirname(outPath), join(serverDir, specialSpecifierPath)).replaceAll('\\', '/');
            output = replaceSpecifier(
                output,
                specifier,
                nextSpecifier.startsWith('.') ? nextSpecifier : `./${nextSpecifier}`
            );
            continue;
        }
        if (!isRelativeSpecifier(specifier)) {
            continue;
        }
        if (validateMiddlewareImports) {
            assertSupportedMiddlewareImport(specifier, sourcePath);
        }
        const resolvedPath = resolveImportedModule(specifier, sourcePath);
        if (!resolvedPath) {
            continue;
        }
        const compiledDependencyPath = await compileImportedModule({
            projectRoot,
            modulesRoot,
            serverDir,
            sourcePath: resolvedPath,
            sourceSpecifier: specifier,
            importerPath: sourcePath,
            ts,
            seen,
            validateMiddlewareImports
        });
        const nextSpecifier = relative(dirname(outPath), compiledDependencyPath).replaceAll('\\', '/');
        output = replaceSpecifier(
            output,
            specifier,
            nextSpecifier.startsWith('.') ? nextSpecifier : `./${nextSpecifier}`
        );
    }

    await writeFile(outPath, output, 'utf8');
    return outPath;
}

export async function writeServerModulePackage({
    projectRoot,
    serverDir,
    entrySource,
    entrySourcePath,
    entryOutputPath,
    modulesRoot,
    validateMiddlewareImports = false
}) {
    const ts = resolveTypeScriptApi(projectRoot);
    const seen = new Set();
    if (validateMiddlewareImports) {
        assertLiteralMiddlewareDynamicImports(ts, entrySource, entrySourcePath);
    }
    let entryOutput = transpileSource(ts, entrySource || '', entrySourcePath || 'route-entry.ts');
    await copyImportMetaAssets({
        source: entrySource,
        sourcePath: entrySourcePath || projectRoot,
        outputPath: entryOutputPath,
        serverDir
    });

    for (const specifier of gatherSpecifiers(entryOutput)) {
        const specialSpecifierPath = SPECIAL_SERVER_SPECIFIERS.get(specifier);
        if (specialSpecifierPath) {
            const nextSpecifier = relative(dirname(entryOutputPath), join(serverDir, specialSpecifierPath)).replaceAll('\\', '/');
            entryOutput = replaceSpecifier(
                entryOutput,
                specifier,
                nextSpecifier.startsWith('.') ? nextSpecifier : `./${nextSpecifier}`
            );
            continue;
        }
        if (!isRelativeSpecifier(specifier)) {
            continue;
        }
        if (validateMiddlewareImports) {
            assertSupportedMiddlewareImport(specifier, entrySourcePath);
        }
        const resolvedPath = resolveImportedModule(specifier, entrySourcePath || projectRoot);
        if (!resolvedPath) {
            continue;
        }
        const compiledDependencyPath = await compileImportedModule({
            projectRoot,
            modulesRoot,
            serverDir,
            sourcePath: resolvedPath,
            sourceSpecifier: specifier,
            importerPath: entrySourcePath,
            ts,
            seen,
            validateMiddlewareImports
        });
        const nextSpecifier = relative(dirname(entryOutputPath), compiledDependencyPath).replaceAll('\\', '/');
        entryOutput = replaceSpecifier(
            entryOutput,
            specifier,
            nextSpecifier.startsWith('.') ? nextSpecifier : `./${nextSpecifier}`
        );
    }

    await mkdir(dirname(entryOutputPath), { recursive: true });
    await writeFile(entryOutputPath, entryOutput, 'utf8');
}
