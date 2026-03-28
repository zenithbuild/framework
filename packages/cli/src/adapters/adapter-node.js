import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGE_REQUIRE = createRequire(import.meta.url);

const NODE_RUNTIME_FILES = [
    {
        from: new URL('../server-runtime/node-server.js', import.meta.url),
        to: 'runtime/node-server.js'
    },
    {
        from: new URL('../server/resolve-request-route.js', import.meta.url),
        to: 'runtime/resolve-request-route.js'
    },
    {
        from: new URL('../request-origin.js', import.meta.url),
        to: 'request-origin.js'
    },
    {
        from: new URL('../server-error.js', import.meta.url),
        to: 'server-error.js'
    },
    {
        from: new URL('../images/service.js', import.meta.url),
        to: 'images/service.js'
    }
];

function createNodeEntrySource() {
    return [
        "import { fileURLToPath } from 'node:url';",
        "import { dirname, resolve } from 'node:path';",
        "import { createNodeServer as createZenithNodeServer, createRequestHandler as createZenithRequestHandler } from './server/runtime/node-server.js';",
        '',
        'const __filename = fileURLToPath(import.meta.url);',
        'const __dirname = dirname(__filename);',
        '',
        'export function createRequestHandler(options = {}) {',
        '  return createZenithRequestHandler({',
        '    distDir: __dirname,',
        '    ...options',
        '  });',
        '}',
        '',
        'export function createNodeServer(options = {}) {',
        '  return createZenithNodeServer({',
        '    distDir: __dirname,',
        '    ...options',
        '  });',
        '}',
        '',
        'const isDirectRun = process.argv[1] && resolve(process.argv[1]) === __filename;',
        '',
        'if (isDirectRun) {',
        '  const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;',
        "  const host = process.env.HOST || '0.0.0.0';",
        '  createNodeServer({ port, host }).then(({ port: actualPort }) => {',
        "    const displayHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;",
        '    console.log(`http://${displayHost}:${actualPort}`);',
        '  }).catch((error) => {',
        '    console.error(error);',
        '    process.exit(1);',
        '  });',
        '}',
        ''
    ].join('\n');
}

function createNodePackageJson() {
    return {
        private: true,
        type: 'module',
        main: './index.js'
    };
}

function createSharpRuntimeSource() {
    const sharpPath = PACKAGE_REQUIRE.resolve('sharp');
    const fallbackUrl = pathToFileURL(sharpPath).href;
    return [
        'async function loadSharp() {',
        '  try {',
        "    const mod = await import('sharp');",
        '    return mod.default || mod;',
        '  } catch {',
        `    const mod = await import(${JSON.stringify(fallbackUrl)});`,
        '    return mod.default || mod;',
        '  }',
        '}',
        '',
        'const sharp = await loadSharp();',
        'export default sharp;',
        ''
    ].join('\n');
}

async function copyNodeRuntimeFiles(serverDir) {
    for (const file of NODE_RUNTIME_FILES) {
        const targetPath = join(serverDir, file.to);
        await mkdir(join(targetPath, '..'), { recursive: true });
        await cp(file.from, targetPath, { force: true });
    }

    const imageServicePath = join(serverDir, 'images', 'service.js');
    const imageServiceSource = await readFile(imageServicePath, 'utf8');
    await writeFile(
        imageServicePath,
        imageServiceSource.replace("import sharp from 'sharp';", "import sharp from './sharp-runtime.js';"),
        'utf8'
    );
    await writeFile(join(serverDir, 'images', 'sharp-runtime.js'), createSharpRuntimeSource(), 'utf8');
}

export const nodeAdapter = {
    name: 'node',
    validateRoutes() {},
    async adapt(options) {
        const staticDir = join(options.coreOutput, 'static');
        const packagedServerDir = join(options.coreOutput, 'server');
        const targetServerDir = join(options.outDir, 'server');

        // Route meaning is fixed upstream in the manifest/server package.
        // The adapter only maps already-classified output into a Node runtime layout.
        await rm(options.outDir, { recursive: true, force: true });
        await mkdir(options.outDir, { recursive: true });
        await cp(staticDir, join(options.outDir, 'static'), { recursive: true, force: true });
        await cp(packagedServerDir, targetServerDir, { recursive: true, force: true });
        await copyNodeRuntimeFiles(targetServerDir);

        await writeFile(
            join(options.outDir, 'manifest.json'),
            `${JSON.stringify(options.manifest, null, 2)}\n`,
            'utf8'
        );
        await writeFile(
            join(targetServerDir, 'config.json'),
            `${JSON.stringify({
                target: 'node',
                base_path: options.manifest.base_path || '/',
                static_dir: '../static',
                build_manifest: '../manifest.json',
                images: options.config?.images || {}
            }, null, 2)}\n`,
            'utf8'
        );
        await writeFile(join(options.outDir, 'index.js'), createNodeEntrySource(), 'utf8');
        await writeFile(
            join(options.outDir, 'package.json'),
            `${JSON.stringify(createNodePackageJson(), null, 2)}\n`,
            'utf8'
        );
    }
};
