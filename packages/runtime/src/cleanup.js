// ---------------------------------------------------------------------------
// cleanup.js — Zenith Runtime V0
// ---------------------------------------------------------------------------
// Deterministic teardown system.
//
// Tracks:
//   - Active effect disposers
//   - Active event listeners
//
// cleanup() removes everything.
// Calling cleanup() twice is a no-op.
// ---------------------------------------------------------------------------

import { resetGlobalSideEffects } from './side-effect-scope.js';
import { runCleanupCallback, throwCleanupErrors } from './effect-utils.js';

/** @type {function[]} */
const _disposers = [];

/** @type {{ element: Element, event: string, handler: function }[]} */
const _listeners = [];

let _cleaned = false;

/**
 * Register an effect disposer for later cleanup.
 *
 * @param {function} dispose
 */
export function _registerDisposer(dispose) {
    _disposers.push(dispose);
    _cleaned = false;
}

/**
 * Register an event listener for later cleanup.
 *
 * @param {Element} element
 * @param {string} event
 * @param {function} handler
 */
export function _registerListener(element, event, handler) {
    _listeners.push({ element, event, handler });
    _cleaned = false;
}

/**
 * Tear down all active effects and event listeners.
 *
 * - Disposes all effects (clears subscriber sets)
 * - Removes all event listeners
 * - Clears registries
 * - Idempotent: calling twice is a no-op
 */
export function cleanup() {
    const errors = [];

    // Global zenMount/zenEffect registrations can be created outside hydrate's
    // disposer table (e.g. page-level component bootstraps). cleanup() is the
    // full runtime teardown boundary, so that scope must be reset on every pass,
    // including the first real cleanup.
    if (_cleaned) {
        resetGlobalSideEffects(errors);
        throwCleanupErrors(errors, 'cleanup');
        return;
    }

    // 1. Dispose all effects
    for (let i = 0; i < _disposers.length; i++) {
        runCleanupCallback(_disposers[i], errors);
    }
    _disposers.length = 0;

    // 2. Remove all event listeners
    for (let i = 0; i < _listeners.length; i++) {
        const { element, event, handler } = _listeners[i];
        runCleanupCallback(() => element.removeEventListener(event, handler), errors);
    }
    _listeners.length = 0;

    // 3. Dispose any top-level reactive work registered outside hydrate.
    resetGlobalSideEffects(errors);

    _cleaned = true;
    throwCleanupErrors(errors, 'cleanup');
}

/**
 * Get counts for testing/debugging.
 * @returns {{ effects: number, listeners: number }}
 */
export function _getCounts() {
    return {
        effects: _disposers.length,
        listeners: _listeners.length
    };
}
