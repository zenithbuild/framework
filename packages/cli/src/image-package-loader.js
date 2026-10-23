import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { devInstallCommand } from './install-command.js';

const CLI_MANIFEST = createRequire(import.meta.url)('../package.json');
const IMAGE_PACKAGE = '@zenithbuild/image';
// <Image> stays at its CLI path for 0.9: component IDs derive from the
// component path, so moving it would change every <Image> page's output.
const IMAGE_COMPONENT_PATH = fileURLToPath(new URL('./framework-components/Image.zen', import.meta.url));
const REQUIRED_EXPORTS = [
    'buildImageArtifacts', 'handleImageRequest', 'handleImageFetchRequest',
    'materializeImageMarkup', 'materializeImageMarkupInHtmlFiles',
    'createImageRuntimePayload', 'injectImageRuntimePayload',
    'injectImageRuntimePayloadIntoHtmlFiles'
];

/**
 * Internal JUD-83 boundary, defined before caller migration.
 * Callers determine image usage before compilation/output mutation. A no-image
 * caller must pass required=false, which never resolves or imports the package.
 * Resolve from the consumer, not from the CLI's own dependency installation.
 *
 * With ifInstalled, an absent package resolves to null instead of throwing;
 * an installed but mismatched or broken package still fails.
 *
 * usedBy lists the project-relative files that use `<Image>`; it is named in
 * the missing-package error.
 *
 * @param {{projectRoot: string, required: boolean, ifInstalled?: boolean, usedBy?: string[]}} options
 */
export async function loadImagePackage({ projectRoot, required, ifInstalled = false, usedBy = [] }) {
    if (!required && !ifInstalled) return null;

    const consumerRequire = createRequire(join(resolve(projectRoot), 'package.json'));
    let manifestPath;
    try {
        manifestPath = consumerRequire.resolve(`${IMAGE_PACKAGE}/package.json`);
    } catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND') throw error;
        if (!required) return null;
        throw new Error(
            `[Zenith:Image] This project requires ${IMAGE_PACKAGE}@${CLI_MANIFEST.version}` +
            (usedBy.length > 0 ? ` because <Image> is used in ${usedBy.join(', ')}. ` : '. ') +
            `Run ${devInstallCommand(projectRoot, `${IMAGE_PACKAGE}@${CLI_MANIFEST.version}`)} in ${projectRoot}.`,
            { cause: error }
        );
    }

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.name !== IMAGE_PACKAGE || manifest.version !== CLI_MANIFEST.version) {
        throw new Error(
            `[Zenith:Image] Expected ${IMAGE_PACKAGE}@${CLI_MANIFEST.version}; ` +
            `found ${manifest.name}@${manifest.version}. ` +
            `Run ${devInstallCommand(projectRoot, `${IMAGE_PACKAGE}@${CLI_MANIFEST.version}`)}.`
        );
    }
    if (typeof manifest.dependencies?.sharp !== 'string' || !manifest.dependencies.sharp.trim()) {
        throw new Error(`[Zenith:Image] ${IMAGE_PACKAGE} must declare its Sharp runtime dependency.`);
    }

    const componentPath = IMAGE_COMPONENT_PATH;
    // Import failures inside an installed image package retain their original
    // cause. They must not be mislabeled as a missing optional package.
    const api = await import(pathToFileURL(consumerRequire.resolve(IMAGE_PACKAGE)).href);
    for (const name of REQUIRED_EXPORTS) {
        if (typeof api[name] !== 'function') {
            throw new Error(`[Zenith:Image] ${IMAGE_PACKAGE} is missing required export ${name}.`);
        }
    }
    return {
        api,
        packageRoot: dirname(manifestPath),
        componentPath,
        sharpVersionRange: manifest.dependencies.sharp
    };
}
