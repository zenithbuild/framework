import { renderRouterCoreSource } from './template-core.js';
import { renderRouterDocumentSource } from './template-document.js';
import { renderRouterFormSource } from './template-form.js';
import { renderRouterLifecycleSource } from './template-lifecycle.js';
import { renderRouterNavigationSource } from './template-navigation.js';
import { renderRouterRefreshSource } from './template-refresh.js';

function normalizeManifestJson(manifestJson) {
    return manifestJson.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function sanitizeImportSpecifier(specifier) {
    return specifier
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r\n/g, '')
        .replace(/[\r\n]/g, '');
}

function renderRouteModuleImporters(manifestJson) {
    let manifest;
    try {
        manifest = JSON.parse(manifestJson);
    } catch (error) {
        throw new Error(`renderRouterModule(opts) received invalid manifestJson: ${error.message}`);
    }

    const chunks = manifest && Object.prototype.hasOwnProperty.call(manifest, 'chunks')
        ? manifest.chunks
        : {};
    if (!chunks || typeof chunks !== 'object' || Array.isArray(chunks)) {
        throw new Error('renderRouterModule(opts) requires manifestJson.chunks to be an object');
    }

    const entries = Object.entries(chunks)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([route, specifier]) => {
            if (typeof specifier !== 'string' || specifier.length === 0) {
                throw new Error(`renderRouterModule(opts) requires a chunk specifier for route ${route}`);
            }
            return `  ${JSON.stringify(route)}: () => import(${JSON.stringify(specifier)})`;
        });

    return `{\n${entries.join(',\n')}\n}`;
}

export function renderRouterModule(opts) {
    if (!opts || typeof opts !== 'object') {
        throw new Error('renderRouterModule(opts) requires an options object');
    }

    const { manifestJson, runtimeImport, coreImport, routeCheck = false, formsEnabled = true } = opts;
    if (typeof manifestJson !== 'string' || manifestJson.length === 0) {
        throw new Error('renderRouterModule(opts) requires opts.manifestJson string');
    }
    if (typeof runtimeImport !== 'string' || runtimeImport.length === 0) {
        throw new Error('renderRouterModule(opts) requires opts.runtimeImport string');
    }
    if (typeof coreImport !== 'string' || coreImport.length === 0) {
        throw new Error('renderRouterModule(opts) requires opts.coreImport string');
    }

    const manifest = normalizeManifestJson(manifestJson);
    const runtimeSpec = sanitizeImportSpecifier(runtimeImport);
    const coreSpec = sanitizeImportSpecifier(coreImport);
    const routeModuleImporters = renderRouteModuleImporters(manifest);

    return `${renderRouterCoreSource({ manifest, routeModuleImporters, runtimeSpec, coreSpec, routeCheck })}\n\n${renderRouterDocumentSource()}\n\n${renderRouterLifecycleSource()}\n\n${renderRouterRefreshSource()}\n\n${renderRouterNavigationSource({ routeCheck, formsEnabled })}${formsEnabled ? `\n\n${renderRouterFormSource()}` : ""}\n`;
}
