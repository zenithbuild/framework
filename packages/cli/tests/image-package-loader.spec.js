import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    await mkdir(packageRoot, { recursive: true });
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
        name: '@zenithbuild/image', version, type: 'module',
        exports: { '.': './index.js', './package.json': './package.json' },
        dependencies: sharp ? { sharp } : {}
    }));
    await writeFile(join(packageRoot, 'index.js'), source ?? apiNames.map((name) => `export function ${name}() {}`).join('\n'));
    return packageRoot;
}

test('no-image consumers do not resolve a package or touch the project filesystem', async () => {
    expect(await loadImagePackage({ projectRoot: join(projectRoot, 'absent'), required: false })).toBeNull();
    await installFixture({ source: 'throw new Error("must never import unused image package");' });
    expect(await loadImagePackage({ projectRoot, required: false })).toBeNull();
});

test('missing image package gives an exact-train consumer install command', async () => {
    await writeFile(join(projectRoot, 'package-lock.json'), '{}');
    await expect(loadImagePackage({ projectRoot, required: true }))
        .rejects.toThrow(`npm i -D @zenithbuild/image@${cliVersion}`);
});

test('the install command follows the project package manager', async () => {
    await writeFile(join(projectRoot, 'pnpm-lock.yaml'), '');
    await expect(loadImagePackage({ projectRoot, required: true }))
        .rejects.toThrow(`pnpm add -D @zenithbuild/image@${cliVersion}`);
});

test('ifInstalled returns null for an absent package but still validates an installed one', async () => {
    const absentRoot = await mkdtemp(join(tmpdir(), 'zenith-image-absent-'));
    try {
        expect(await loadImagePackage({ projectRoot: absentRoot, required: false, ifInstalled: true })).toBeNull();
    } finally {
        await rm(absentRoot, { recursive: true, force: true });
    }
    await installFixture({ version: '99.0.0' });
    await expect(loadImagePackage({ projectRoot, required: false, ifInstalled: true }))
        .rejects.toThrow('found @zenithbuild/image@99.0.0');
});

test('consumer resolution returns the package API, CLI component path and Sharp range', async () => {
    const packageRoot = await installFixture();
    const result = await loadImagePackage({ projectRoot, required: true });
    expect(result.packageRoot).toBe(packageRoot);
    // <Image> stays at the CLI's framework-components path so component IDs match 0.8.
    expect(result.componentPath).toBe(fileURLToPath(new URL('../src/framework-components/Image.zen', import.meta.url)));
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
