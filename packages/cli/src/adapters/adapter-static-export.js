import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { prependBasePath } from '../base-path.js';
import { toStaticHtmlFilePath } from '../static-export-paths.js';

function stripLeadingSlash(value) {
    return String(value || '').replace(/^\/+/, '');
}

function collectConcretePaths(route) {
    if (route.path_kind === 'dynamic') {
        return Array.isArray(route.export_paths) ? route.export_paths : [];
    }
    return [route.path];
}

async function copySupportFiles({ staticDir, outDir, publicRoot, skippedFiles }) {
    async function walk(currentDir) {
        let entries = [];
        try {
            entries = await readdir(currentDir);
        } catch {
            return;
        }

        entries.sort((left, right) => left.localeCompare(right));
        for (const name of entries) {
            const sourcePath = join(currentDir, name);
            const info = await stat(sourcePath);
            if (info.isDirectory()) {
                await walk(sourcePath);
                continue;
            }

            const relativePath = relative(staticDir, sourcePath).replaceAll('\\', '/');
            if (relativePath === 'manifest.json') {
                await cp(sourcePath, join(outDir, 'manifest.json'), { force: true });
                continue;
            }
            if (skippedFiles.has(relativePath)) {
                continue;
            }

            const targetPath = join(publicRoot, relativePath);
            await mkdir(dirname(targetPath), { recursive: true });
            await cp(sourcePath, targetPath, { force: true });
        }
    }

    await walk(staticDir);
}

async function writeConcreteHtmlFiles({ staticDir, outDir, routes, basePath }) {
    for (const route of routes) {
        const sourceHtmlPath = join(staticDir, stripLeadingSlash(route.html));
        const sourceHtml = await readFile(sourceHtmlPath, 'utf8');
        for (const concretePath of collectConcretePaths(route)) {
            const publicPath = prependBasePath(basePath, concretePath);
            const outputPath = join(outDir, toStaticHtmlFilePath(publicPath));
            await mkdir(dirname(outputPath), { recursive: true });
            await writeFile(outputPath, sourceHtml, 'utf8');
        }
    }
}

export const staticExportAdapter = {
    name: 'static-export',
    validateRoutes(manifest) {
        const concretePathOwners = new Map();

        for (const route of manifest) {
            if (route.render_mode === 'server') {
                throw new Error(
                    `[Zenith:Build] target "static-export" cannot emit server-rendered routes. ` +
                    `Route "${route.path}" (${route.file}) requires render_mode="server".`
                );
            }
            if (route.path_kind === 'static') {
                if (Array.isArray(route.export_paths) && route.export_paths.length > 0) {
                    throw new Error(
                        `[Zenith:Build] target "static-export" only accepts exportPaths on dynamic prerender routes. ` +
                        `Route "${route.path}" (${route.file}) is already concrete.`
                    );
                }
            } else {
                if (!Array.isArray(route.export_paths) || route.export_paths.length === 0) {
                    throw new Error(
                        `[Zenith:Build] target "static-export" requires explicit exportPaths for dynamic prerender routes. ` +
                        `Route "${route.path}" (${route.file}) has no concrete export-path contract.`
                    );
                }
            }

            for (const concretePath of collectConcretePaths(route)) {
                const existing = concretePathOwners.get(concretePath);
                if (existing) {
                    throw new Error(
                        `[Zenith:Build] target "static-export" produced a duplicate concrete path "${concretePath}" ` +
                        `from "${existing.file}" and "${route.file}".`
                    );
                }
                concretePathOwners.set(concretePath, route);
            }
        }
    },
    async adapt(options) {
        const staticDir = join(options.coreOutput, 'static');
        const routes = Array.isArray(options.manifest?.routes) ? options.manifest.routes : [];
        const skippedFiles = new Set(
            routes
                .map((route) => stripLeadingSlash(route.html))
                .filter((value) => value.length > 0)
        );
        const basePath = options.manifest?.base_path || '/';
        const publicRoot = basePath === '/'
            ? options.outDir
            : join(options.outDir, stripLeadingSlash(basePath));

        await rm(options.outDir, { recursive: true, force: true });
        await mkdir(options.outDir, { recursive: true });
        await mkdir(publicRoot, { recursive: true });

        await copySupportFiles({
            staticDir,
            outDir: options.outDir,
            publicRoot,
            skippedFiles
        });
        await writeConcreteHtmlFiles({
            staticDir,
            outDir: options.outDir,
            routes,
            basePath
        });
    }
};
