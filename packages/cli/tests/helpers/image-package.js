import { mkdir, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('@zenithbuild/image/package.json'));
const imageRequire = createRequire(join(packageRoot, 'package.json'));
export const sharp = (await import(pathToFileURL(imageRequire.resolve('sharp')).href)).default;

export async function installImagePackage(projectRoot) {
    const scope = join(projectRoot, 'node_modules', '@zenithbuild');
    await mkdir(scope, { recursive: true });
    try { await symlink(packageRoot, join(scope, 'image'), 'junction'); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
}
