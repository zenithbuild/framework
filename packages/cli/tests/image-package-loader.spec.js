import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadImagePackage } from '../src/image-package-loader.js';

const cliVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const apiNames = [
    'buildImageArtifacts', 'handleImageRequest', 'handleImageFetchRequest',
    'materializeImageMarkup', 'materializeImageMarkupInHtmlFiles',
    'createImageRuntimePayload', 'injectImageRuntimePayload',
    'injectImageRuntimePayloadIntoHtmlFiles'
];
let projectRoot;

beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'zenith-image-consumer-'));
});
afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); });

async function installFixture({ version = cliVersion, sharp = '^0.35.5', source } = {}) {
    const packageRoot = join(projectRoot, 'node_modules', '@zenithbuild', 'image');
    await mkdir(join(packageRoot, 'components'), { recursive: true });
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
        name: '@zenithbuild/image', version, type: 'module',
        exports: { '.': './index.js', './package.json': './package.json', './components/Image.zen': './components/Image.zen' },
        dependencies: sharp ? { sharp } : {}
    }));
    await writeFile(join(packageRoot, 'components', 'Image.zen'), '<img alt="fixture" />');
    await writeFile(join(packageRoot, 'index.js'), source ?? apiNames.map((name) => `export function ${name}() {}`).join('\n'));
    return packageRoot;
}

test('no-image consumers do not resolve a package or touch the project filesystem', async () => {
    expect(await loadImagePackage({ projectRoot: join(projectRoot, 'absent'), required: false })).toBeNull();
    await installFixture({ source: 'throw new Error("must never import unused image package");' });
    expect(await loadImagePackage({ projectRoot, required: false })).toBeNull();
});

test('missing image package gives an exact-train consumer install command', async () => {
    await expect(loadImagePackage({ projectRoot, required: true }))
        .rejects.toThrow(`npm i -D @zenithbuild/image@${cliVersion}`);
});

test('consumer resolution returns the package API, component and Sharp range', async () => {
    const packageRoot = await installFixture();
    const result = await loadImagePackage({ projectRoot, required: true });
    expect(result.packageRoot).toBe(packageRoot);
    expect(result.componentPath).toBe(join(packageRoot, 'components', 'Image.zen'));
    expect(result.sharpVersionRange).toBe('^0.35.5');
    expect(apiNames.every((name) => typeof result.api[name] === 'function')).toBe(true);
});

test('rejects a mixed train before evaluating package code', async () => {
    await installFixture({ version: '99.0.0', source: 'throw new Error("must not import wrong train");' });
    await expect(loadImagePackage({ projectRoot, required: true })).rejects.toThrow('found @zenithbuild/image@99.0.0');
});

test('rejects a package without its hard Sharp dependency', async () => {
    await installFixture({ sharp: null });
    await expect(loadImagePackage({ projectRoot, required: true })).rejects.toThrow('must declare its Sharp runtime dependency');
});

test('retains installed-package failures instead of calling them an absent image package', async () => {
    await installFixture({ source: 'throw new Error("broken Sharp installation");' });
    await expect(loadImagePackage({ projectRoot, required: true })).rejects.toThrow('broken Sharp installation');
});

test('rejects an incomplete public pipeline API', async () => {
    await installFixture({ source: 'export const buildImageArtifacts = () => {};' });
    await expect(loadImagePackage({ projectRoot, required: true })).rejects.toThrow('missing required export handleImageRequest');
});
