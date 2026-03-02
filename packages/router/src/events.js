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

const ROUTE_POLICY_KEY = '__zenith_route_protection_policy';
const ROUTE_EVENT_LISTENERS_KEY = '__zenith_route_event_listeners';
const ROUTE_EVENT_NAMES = [
    'guard:start',
    'guard:end',
    'route-check:start',
    'route-check:end',
    'route-check:error',
    'route:deny',
    'route:redirect'
];

function getRouteProtectionScope() {
    return typeof globalThis === 'object' && globalThis ? globalThis : {};
}

function ensureRouteProtectionState() {
    const scope = getRouteProtectionScope();

    let policy = scope[ROUTE_POLICY_KEY];
    if (!policy || typeof policy !== 'object') {
        policy = {};
        scope[ROUTE_POLICY_KEY] = policy;
    }

    let listeners = scope[ROUTE_EVENT_LISTENERS_KEY];
    if (!listeners || typeof listeners !== 'object') {
        listeners = Object.create(null);
        scope[ROUTE_EVENT_LISTENERS_KEY] = listeners;
    }

    for (const eventName of ROUTE_EVENT_NAMES) {
        if (!(listeners[eventName] instanceof Set)) {
            listeners[eventName] = new Set();
        }
    }

    return { policy, listeners };
}

/**
 * Configure default behaviors for route protection.
 * @param {import('../index').RouteProtectionPolicy} policy 
 */
export function setRouteProtectionPolicy(policy) {
    const state = ensureRouteProtectionState();
    state.policy = Object.assign({}, state.policy, policy);
    getRouteProtectionScope()[ROUTE_POLICY_KEY] = state.policy;
}

export function _getRouteProtectionPolicy() {
    return ensureRouteProtectionState().policy;
}

/**
 * Listen to route protection lifecycle events.
 * @param {string} eventName 
 * @param {Function} handler 
 */
export function on(eventName, handler) {
    const listeners = ensureRouteProtectionState().listeners;
    if (listeners[eventName] instanceof Set) {
        listeners[eventName].add(handler);
    }
}

/**
 * Remove a route protection lifecycle event listener.
 * @param {string} eventName 
 * @param {Function} handler 
 */
export function off(eventName, handler) {
    const listeners = ensureRouteProtectionState().listeners;
    if (listeners[eventName] instanceof Set) {
        listeners[eventName].delete(handler);
    }
}

export function _dispatchRouteEvent(eventName, payload) {
    const listeners = ensureRouteProtectionState().listeners[eventName];
    if (!(listeners instanceof Set)) {
        return;
    }

    for (const handler of listeners) {
        try {
            handler(payload);
        } catch (e) {
            console.error(`[Zenith Router] Error in ${eventName} listener:`, e);
        }
    }
}
