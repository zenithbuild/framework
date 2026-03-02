// ---------------------------------------------------------------------------
// navigate.js — Zenith Router V0
// ---------------------------------------------------------------------------
// Navigation API.
//
// - navigate(path)    → push to history, trigger route change
// - back()            → history.back()
// - forward()         → history.forward()
// - getCurrentPath()  → current pathname
//
// The navigate function accepts a resolver callback so the router
// can wire match → mount logic without circular dependencies.
// ---------------------------------------------------------------------------

import { push, current } from './history.js';
import { _dispatchRouteChange } from './events.js';

/** @type {((path: string) => Promise<void>) | null} */
let _resolveNavigation = null;

/**
 * Wire the navigation resolver.
 * Called once by createRouter() to bind match → mount logic.
 *
 * @param {(path: string) => Promise<void>} resolver
 */
export function _setNavigationResolver(resolver) {
    _resolveNavigation = resolver;
}

/**
 * Navigate to a path.
 * Pushes history, then resolves through the router pipeline.
 *
 * @param {string} path
 * @returns {Promise<void>}
 */
export async function navigate(path) {
    push(path);

    if (_resolveNavigation) {
        await _resolveNavigation(path);
    }
}

/**
 * Go back in history.
 */
export function back() {
    history.back();
}

/**
 * Go forward in history.
 */
export function forward() {
    history.forward();
}

/**
 * Get the current pathname.
 *
 * @returns {string}
 */
export function getCurrentPath() {
    return current();
}
