// ---------------------------------------------------------------------------
// history.js — Zenith Router V0
// ---------------------------------------------------------------------------
// Minimal source-router path helpers.
//
// The template-generated router owns real History API writes.
// This source helper keeps a narrow in-memory path override for
// source-level tests and simple router assembly without leaking
// soft-nav history writes into the shipped runtime contract.
//
// - push(path)     → update source-router current path
// - replace(path)  → update source-router current path
// - listen(cb)     → popstate listener, returns unlisten
// - current()      → source-router path or current location.pathname
//
// No hash routing. No scroll restoration. No batching.
// ---------------------------------------------------------------------------

/** @type {Set<(path: string) => void>} */
const _listeners = new Set();

/** @type {boolean} */
let _listening = false;

/** @type {string | null} */
let _currentPathOverride = null;

/** @type {string | null} */
let _lastObservedWindowPath = null;

function _readWindowPath() {
    return window.location.pathname;
}

function _syncWindowPath() {
    const windowPath = _readWindowPath();
    if (_lastObservedWindowPath !== windowPath) {
        _lastObservedWindowPath = windowPath;
        _currentPathOverride = null;
    }
    return windowPath;
}

/**
 * Internal popstate handler — fires all registered listeners.
 */
function _onPopState() {
    const path = _syncWindowPath();
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
    _lastObservedWindowPath = _readWindowPath();
    _currentPathOverride = path;
}

/**
 * Replace the current path in browser history.
 *
 * @param {string} path
 */
export function replace(path) {
    _lastObservedWindowPath = _readWindowPath();
    _currentPathOverride = path;
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
    const windowPath = _syncWindowPath();
    return _currentPathOverride ?? windowPath;
}
