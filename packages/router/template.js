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

export function renderRouterModule(opts) {
    if (!opts || typeof opts !== 'object') {
        throw new Error('renderRouterModule(opts) requires an options object');
    }

    const { manifestJson, runtimeImport, coreImport, routeCheck = false } = opts;
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

    return `${renderRouterCoreSource({ manifest, runtimeSpec, coreSpec, routeCheck })}\n\n${renderRouterDocumentSource()}\n\n${renderRouterLifecycleSource()}\n\n${renderRouterRefreshSource()}\n\n${renderRouterNavigationSource()}\n\n${renderRouterFormSource()}\n`;
}
