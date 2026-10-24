import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeServerModulePackage } from '../dist/server-module-output.js';

describe('server module static assets', () => {
    test('copies literal import.meta.url directories beside relocated modules', async () => {
        const root = await mkdtemp(join(tmpdir(), 'zenith-server-assets-'));
        const projectRoot = join(root, 'project');
        const serverDir = join(projectRoot, 'dist', 'server');
        const routeDir = join(serverDir, 'routes', 'index');
        const entrySourcePath = join(projectRoot, 'src', 'entry.ts');
        const loaderPath = join(projectRoot, 'src', 'loader.ts');
        const contentPath = join(projectRoot, 'content', 'article.md');

        try {
            await mkdir(join(projectRoot, 'src'), { recursive: true });
            await mkdir(join(projectRoot, 'content'), { recursive: true });
            await writeFile(loaderPath, [
                'export const contentRoot = new URL("../content/", import.meta.url);',
                ''
            ].join('\n'));
            await writeFile(contentPath, '# Packed content\n');

            const entrySource = [
                'import { contentRoot } from "./loader";',
                'export const load = () => ({ contentRoot });',
                ''
            ].join('\n');
            await writeServerModulePackage({
                projectRoot,
                serverDir,
                entrySource,
                entrySourcePath,
                entryOutputPath: join(routeDir, 'route', 'entry.js'),
                modulesRoot: join(routeDir, 'modules')
            });

            const emittedAsset = join(routeDir, 'modules', 'content', 'article.md');
            await access(emittedAsset);
            expect(await readFile(emittedAsset, 'utf8')).toBe('# Packed content\n');
            expect(await readFile(join(routeDir, 'modules', 'src', 'loader.js'), 'utf8'))
                .toContain('new URL("../content/", import.meta.url)');
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
