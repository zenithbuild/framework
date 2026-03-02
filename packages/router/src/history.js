// ---------------------------------------------------------------------------
// history.js — Zenith Router V0
// ---------------------------------------------------------------------------
// Minimal navigation helpers without History API mutation.
//
// - push(path)     → hard navigation (assign)
// - replace(path)  → hard navigation (replace)
// - listen(cb)     → popstate listener, returns unlisten
// - current()      → location.pathname
//
// No hash routing. No scroll restoration. No batching.
// ---------------------------------------------------------------------------

/** @type {Set<(path: string) => void>} */
const _listeners = new Set();

/** @type {boolean} */
let _listening = false;

/**
 * Internal popstate handler — fires all registered listeners.
 */
function _onPopState() {
    const path = current();
    for (const cb of _listeners) {
        cb(path);
    }
}

/**
 * Ensure the global popstate listener is attached (once).
 */
function _ensureListening() {
    if (_listening) return;
    window.addEventListener('popstate', _onPopState);
    _listening = true;
}

/**
 * Push a new path to the browser history.
 *
 * @param {string} path
 */
export function push(path) {
    window.location.assign(path);
}

/**
 * Replace the current path in browser history.
 *
 * @param {string} path
 */
export function replace(path) {
    window.location.replace(path);
}

/**
 * Subscribe to popstate (back/forward) events.
 * Returns an unlisten function.
 *
 * @param {(path: string) => void} callback
 * @returns {() => void} unlisten
 */
export function listen(callback) {
    _ensureListening();
    _listeners.add(callback);

    return () => {
        _listeners.delete(callback);
        if (_listeners.size === 0) {
            window.removeEventListener('popstate', _onPopState);
            _listening = false;
        }
    };
}

/**
 * Get the current pathname.
 *
 * @returns {string}
 */
export function current() {
    return window.location.pathname;
}
