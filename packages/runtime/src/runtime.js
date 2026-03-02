// ---------------------------------------------------------------------------
// runtime.js — Zenith Runtime V0
// ---------------------------------------------------------------------------
// Backward-compatible mount wrapper around explicit hydrate(payload).
// ---------------------------------------------------------------------------

import { hydrate } from './hydrate.js';
import { cleanup } from './cleanup.js';

/**
 * Mount a page module that already contains deterministic binding tables.
 *
 * @param {HTMLElement} container
 * @param {object | function} pageModule
 * @returns {() => void}
 */
export function mount(container, pageModule) {
    if (!container || typeof container.querySelectorAll !== 'function') {
        throw new Error('[Zenith Runtime] mount(container, pageModule) requires a DOM container');
    }

    const pageFactory = _resolvePageFactory(pageModule);
    if (!pageFactory) {
        throw new Error('[Zenith Runtime] mount(container, pageModule) requires default() or __zenith_page()');
    }

    const page = pageFactory();
    if (!page || typeof page.html !== 'string') {
        throw new Error('[Zenith Runtime] __zenith_page() must return an object with html');
    }

    container.innerHTML = page.html;

    hydrate({
        root: container,
        ir_version: page.ir_version,
        expressions: Array.isArray(page.expressions) ? page.expressions : [],
        markers: Array.isArray(page.markers) ? page.markers : [],
        events: Array.isArray(page.events) ? page.events : [],
        state_values: Array.isArray(page.state_values) ? page.state_values : [],
        signals: Array.isArray(page.signals) ? page.signals : [],
        components: Array.isArray(page.components) ? page.components : []
    });

    return function unmount() {
        cleanup();
        container.innerHTML = '';
    };
}

function _resolvePageFactory(pageModule) {
    if (typeof pageModule === 'function') return pageModule;
    if (!pageModule || typeof pageModule !== 'object') return null;
    if (typeof pageModule.default === 'function') return pageModule.default;
    if (typeof pageModule.__zenith_page === 'function') return pageModule.__zenith_page;
    return null;
}
