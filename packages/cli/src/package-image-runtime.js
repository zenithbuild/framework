import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

export async function packageImageRuntime(serverDir, imagePackage) {
    const target = join(serverDir, 'images');
    await mkdir(target, { recursive: true });
    // All generated artifacts get a standalone pure base-path implementation.
    await cp(require.resolve('@zenithbuild/config/base-path'), join(serverDir, 'base-path.js'));
    if (!imagePackage?.packageRoot) {
        const stub = "export async function handleImageRequest(_req, res) { res.writeHead(404); res.end('Not Found'); }\nexport async function handleImageFetchRequest() { return new Response('Not Found', { status: 404 }); }\n";
        await writeFile(join(target, 'service.js'), stub);
        await writeFile(join(target, 'index.js'), "export * from './service.js';\n");
        return;
    }
    await cp(join(imagePackage.packageRoot, 'dist'), target, { recursive: true, force: true });
    await cp(require.resolve('@zenithbuild/config/images'), join(target, 'image-config.js'));
    for (const name of ['shared.js', 'runtime.js']) {
        const file = join(target, name);
        const source = await readFile(file, 'utf8');
        await writeFile(file, source
            .replaceAll("'@zenithbuild/config/base-path'", "'../base-path.js'")
            .replaceAll("'@zenithbuild/config/images'", "'./image-config.js'"));
    }
    await writeFile(join(target, 'package.json'), JSON.stringify({
        type: 'module', dependencies: { sharp: imagePackage.sharpVersionRange }
    }, null, 2) + '\n');
}
