// ---------------------------------------------------------------------------
// events.js — Zenith Router V0
// ---------------------------------------------------------------------------
// Route change event system.
//
// Subscribers receive route change notifications.
// Returns unsubscribe function.
// No batching. No queue. Synchronous dispatch.
// ---------------------------------------------------------------------------

/** @type {Set<(detail: object) => void>} */
const _subscribers = new Set();

/**
 * Subscribe to route change events.
 *
 * @param {(detail: { path: string, params?: Record<string, string>, matched: boolean }) => void} callback
 * @returns {() => void} unsubscribe
 */
export function onRouteChange(callback) {
    _subscribers.add(callback);

    return () => {
        _subscribers.delete(callback);
    };
}

/**
 * Dispatch a route change to all subscribers.
 *
 * @param {{ path: string, params?: Record<string, string>, matched: boolean }} detail
 */
export function _dispatchRouteChange(detail) {
    for (const cb of _subscribers) {
        cb(detail);
    }
}

/**
 * Clear all subscribers. Used for testing and teardown.
 */
export function _clearSubscribers() {
    _subscribers.clear();
}

/**
 * Get the current subscriber count. Used for leak detection.
 *
 * @returns {number}
 */
export function _getSubscriberCount() {
    return _subscribers.size;
}

// --- Route Protection Events & Policy ---

let _routePolicy = {};

/**
 * Configure default behaviors for route protection.
 * @param {import('../index').RouteProtectionPolicy} policy 
 */
export function setRouteProtectionPolicy(policy) {
    _routePolicy = Object.assign({}, _routePolicy, policy);
}

export function _getRouteProtectionPolicy() {
    return _routePolicy;
}

const _eventListeners = {
    'guard:start': new Set(),
    'guard:end': new Set(),
    'route-check:start': new Set(),
    'route-check:end': new Set(),
    'route-check:error': new Set(),
    'route:deny': new Set(),
    'route:redirect': new Set()
};

/**
 * Listen to route protection lifecycle events.
 * @param {string} eventName 
 * @param {Function} handler 
 */
export function on(eventName, handler) {
    if (_eventListeners[eventName]) {
        _eventListeners[eventName].add(handler);
    }
}

/**
 * Remove a route protection lifecycle event listener.
 * @param {string} eventName 
 * @param {Function} handler 
 */
export function off(eventName, handler) {
    if (_eventListeners[eventName]) {
        _eventListeners[eventName].delete(handler);
    }
}

export function _dispatchRouteEvent(eventName, payload) {
    if (_eventListeners[eventName]) {
        for (const handler of _eventListeners[eventName]) {
            try {
                handler(payload);
            } catch (e) {
                console.error(`[Zenith Router] Error in ${eventName} listener:`, e);
            }
        }
    }
}
