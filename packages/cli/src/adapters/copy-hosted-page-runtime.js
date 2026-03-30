import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGE_REQUIRE = createRequire(import.meta.url);

const HOSTED_PAGE_RUNTIME_DIRS = ['runtime', 'images', 'auth'];
const HOSTED_PAGE_RUNTIME_FILES = [
    'base-path.js',
    'server-contract.js',
    'server-error.js',
    'resource-response.js',
    'download-result.js'
];

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

export async function copyHostedPageRuntime(coreOutput, targetDir) {
    const serverDir = join(coreOutput, 'server');
    await mkdir(targetDir, { recursive: true });

    for (const name of HOSTED_PAGE_RUNTIME_DIRS) {
        await cp(join(serverDir, name), join(targetDir, name), {
            recursive: true,
            force: true
        });
    }

    for (const name of HOSTED_PAGE_RUNTIME_FILES) {
        await cp(join(serverDir, name), join(targetDir, name), { force: true });
    }

    const imageServicePath = join(targetDir, 'images', 'service.js');
    const imageServiceSource = await readFile(imageServicePath, 'utf8');
    await writeFile(
        imageServicePath,
        imageServiceSource.replace("import sharp from 'sharp';", "import sharp from './sharp-runtime.js';"),
        'utf8'
    );
    await writeFile(join(targetDir, 'images', 'sharp-runtime.js'), createSharpRuntimeSource(), 'utf8');
}
