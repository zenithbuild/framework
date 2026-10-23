import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, sep } from 'node:path';

const require = createRequire(import.meta.url);

// Emitted server files that stand in for @zenithbuild/config subpaths. Server
// output is self-contained: it never resolves @zenithbuild/config at runtime.
export const CONFIG_RUNTIME_FILES = Object.freeze({
    '@zenithbuild/config/base-path': 'base-path.js',
    '@zenithbuild/config/images': 'image-config.js'
});

const SPECIFIER_FILE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);
// Static `import … from`, `export … from`, side-effect `import '…'`, and
// dynamic or type-level `import('…')`. Comments and plain strings never match
// these forms, and the post-rewrite check catches anything the scan misses.
const SPECIFIER_PATTERNS = [
    /(\bfrom\s*)(['"])([^'"\n]+)\2/g,
    /(\bimport\s*)(['"])([^'"\n]+)\2/g,
    /(\bimport\s*\(\s*)(['"])([^'"\n]+)\2/g
];

function toImportPath(fromFile, toFile) {
    const rel = relative(dirname(fromFile), toFile).split(sep).join('/');
    return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * Rewrite @zenithbuild/config specifiers in one emitted module.
 * Throws when a config (or other @zenithbuild) specifier has no emitted
 * replacement, or when any config reference survives the rewrite.
 *
 * @param {string} source
 * @param {{ filePath: string, serverDir: string, specifierMap?: Record<string, string> }} options
 */
export function rewriteConfigSpecifiers(source, { filePath, serverDir, specifierMap = CONFIG_RUNTIME_FILES }) {
    let next = source;
    for (const pattern of SPECIFIER_PATTERNS) {
        next = next.replace(pattern, (match, prefix, quote, specifier) => {
            if (!specifier.startsWith('@zenithbuild/')) {
                return match;
            }
            const target = specifierMap[specifier];
            if (!target) {
                throw new Error(
                    `[Zenith:Image] Cannot package ${relative(serverDir, filePath)}: ` +
                    `no server runtime file for import specifier "${specifier}".`
                );
            }
            return `${prefix}${quote}${toImportPath(filePath, join(serverDir, target))}${quote}`;
        });
    }
    if (next.includes('@zenithbuild/config')) {
        throw new Error(
            `[Zenith:Image] Cannot package ${relative(serverDir, filePath)}: ` +
            'an unrewritten @zenithbuild/config specifier remains.'
        );
    }
    return next;
}

async function listFiles(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await listFiles(path));
        else if (entry.isFile()) out.push(path);
    }
    return out.sort();
}

function isModuleFile(path) {
    return SPECIFIER_FILE_EXTENSIONS.has(extname(path)) || path.endsWith('.d.ts');
}

export async function rewriteConfigSpecifiersInDir(dir, serverDir, specifierMap = CONFIG_RUNTIME_FILES) {
    for (const filePath of await listFiles(dir)) {
        if (!isModuleFile(filePath)) continue;
        const source = await readFile(filePath, 'utf8');
        const next = rewriteConfigSpecifiers(source, { filePath, serverDir, specifierMap });
        if (next !== source) await writeFile(filePath, next);
    }
}

export async function packageImageRuntime(serverDir, imagePackage) {
    const target = join(serverDir, 'images');
    await mkdir(target, { recursive: true });
    // All generated artifacts get standalone pure base-path and image-config
    // implementations; route rendering injects the image runtime payload with
    // or without the optional image package.
    for (const [specifier, file] of Object.entries(CONFIG_RUNTIME_FILES)) {
        const emitted = join(serverDir, file);
        await cp(require.resolve(specifier), emitted);
        await writeFile(emitted, rewriteConfigSpecifiers(await readFile(emitted, 'utf8'), { filePath: emitted, serverDir }));
    }
    if (!imagePackage?.packageRoot) {
        const stub = "export async function handleImageRequest(_req, res) { res.writeHead(404); res.end('Not Found'); }\nexport async function handleImageFetchRequest() { return new Response('Not Found', { status: 404 }); }\n";
        await writeFile(join(target, 'service.js'), stub);
        await writeFile(join(target, 'index.js'), "export * from './service.js';\n");
        return;
    }
    await cp(join(imagePackage.packageRoot, 'dist'), target, { recursive: true, force: true });
    await rewriteConfigSpecifiersInDir(target, serverDir);
    await writeFile(join(target, 'package.json'), JSON.stringify({
        type: 'module', dependencies: { sharp: imagePackage.sharpVersionRange }
    }, null, 2) + '\n');
}
