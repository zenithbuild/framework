import { isConfigKeyExplicit, isLoadedConfig } from '../config.js';
import { netlifyAdapter } from './adapter-netlify.js';
import { nodeAdapter } from './adapter-node.js';
import { netlifyStaticAdapter } from './adapter-netlify-static.js';
import { staticExportAdapter } from './adapter-static-export.js';
import { staticAdapter } from './adapter-static.js';
import { KNOWN_TARGETS } from './adapter-types.js';
import { vercelAdapter } from './adapter-vercel.js';
import { vercelStaticAdapter } from './adapter-vercel-static.js';

const LEGACY_ADAPTER = {
    name: 'legacy',
    validateRoutes() {
        // Internal build() callers without loaded config stay on the pre-target contract.
    },
    adapt: staticAdapter.adapt
};

function validateAdapterShape(adapter) {
    if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) {
        throw new Error('[Zenith:Config] Key "adapter" must be a plain object');
    }
    if (typeof adapter.name !== 'string' || adapter.name.trim().length === 0) {
        throw new Error('[Zenith:Config] Key "adapter.name" must be a non-empty string');
    }
    if (typeof adapter.validateRoutes !== 'function') {
        throw new Error('[Zenith:Config] Key "adapter.validateRoutes" must be a function');
    }
    if (typeof adapter.adapt !== 'function') {
        throw new Error('[Zenith:Config] Key "adapter.adapt" must be a function');
    }
    return adapter;
}

function resolveTargetAdapter(target) {
    if (target === 'static') {
        return staticAdapter;
    }
    if (target === 'static-export') {
        return staticExportAdapter;
    }
    if (target === 'vercel-static') {
        return vercelStaticAdapter;
    }
    if (target === 'netlify-static') {
        return netlifyStaticAdapter;
    }
    if (target === 'vercel') {
        return vercelAdapter;
    }
    if (target === 'netlify') {
        return netlifyAdapter;
    }
    if (target === 'node') {
        return nodeAdapter;
    }
    if (KNOWN_TARGETS.includes(target)) {
        throw new Error(`[Zenith:Build] Target "${target}" is not supported yet.`);
    }
    throw new Error(`[Zenith:Config] Unsupported target: "${target}"`);
}

export function resolveBuildAdapter(config = {}) {
    const targetExplicit = isConfigKeyExplicit(config, 'target');
    const adapterExplicit = isConfigKeyExplicit(config, 'adapter') && config.adapter !== null && config.adapter !== undefined;

    if (targetExplicit && adapterExplicit) {
        throw new Error('[Zenith:Config] Keys "target" and "adapter" are mutually exclusive');
    }

    if (adapterExplicit) {
        const adapter = validateAdapterShape(config.adapter);
        return {
            target: adapter.name,
            adapter,
            mode: 'adapter'
        };
    }

    if (targetExplicit || isLoadedConfig(config)) {
        const target = typeof config.target === 'string' && config.target.trim().length > 0
            ? config.target.trim()
            : 'static';
        return {
            target,
            adapter: resolveTargetAdapter(target),
            mode: 'target'
        };
    }

    return {
        target: 'legacy',
        adapter: LEGACY_ADAPTER,
        mode: 'legacy'
    };
}
