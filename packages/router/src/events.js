// ---------------------------------------------------------------------------
// events.js — Zenith Router V0
// ---------------------------------------------------------------------------
// Route change event system.
//
// Subscribers receive route change notifications.
// Returns unsubscribe function.
// No batching. No queue. Synchronous dispatch.
// ---------------------------------------------------------------------------

/**
 * @typedef {{ path: string, params?: Record<string, string>, matched: boolean }} RouteChangeDetail
 * @typedef {{ beforeResolve?: boolean, emitRedirects?: boolean }} RouteProtectionPolicy
 * @typedef {(payload: unknown) => void} RouteEventHandler
 * @typedef {{ [eventName: string]: Set<RouteEventHandler> }} RouteEventListeners
 * @typedef {{
 *   __zenith_route_protection_policy?: RouteProtectionPolicy,
 *   __zenith_route_event_listeners?: RouteEventListeners
 * }} RouteProtectionScope
 */

/** @type {Set<(detail: RouteChangeDetail) => void>} */
const _subscribers = new Set();

/**
 * Subscribe to route change events.
 *
 * @param {(detail: RouteChangeDetail) => void} callback
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
 * @param {RouteChangeDetail} detail
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
    return /** @type {RouteProtectionScope} */ (
        typeof globalThis === 'object' && globalThis ? globalThis : {}
    );
}

/**
 * @returns {{ policy: RouteProtectionPolicy, listeners: RouteEventListeners }}
 */
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
    const routeEventListeners = /** @type {RouteEventListeners} */ (listeners);

    for (const eventName of ROUTE_EVENT_NAMES) {
        const existingListeners = routeEventListeners[eventName];
        if (!(existingListeners instanceof Set)) {
            routeEventListeners[eventName] = new Set();
        }
    }

    return {
        policy: /** @type {RouteProtectionPolicy} */ (policy),
        listeners: routeEventListeners
    };
}

/**
 * Configure default behaviors for route protection.
 * @param {RouteProtectionPolicy} policy
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
 * @param {RouteEventHandler} handler
 */
export function on(eventName, handler) {
    const listeners = ensureRouteProtectionState().listeners;
    const eventListeners = listeners[eventName];
    if (eventListeners instanceof Set) {
        eventListeners.add(handler);
    }
}

/**
 * Remove a route protection lifecycle event listener.
 * @param {string} eventName
 * @param {RouteEventHandler} handler
 */
export function off(eventName, handler) {
    const listeners = ensureRouteProtectionState().listeners;
    const eventListeners = listeners[eventName];
    if (eventListeners instanceof Set) {
        eventListeners.delete(handler);
    }
}

/**
 * @param {string} eventName
 * @param {unknown} payload
 * @returns {void}
 */
export function _dispatchRouteEvent(eventName, payload) {
    const eventListeners = ensureRouteProtectionState().listeners[eventName];
    if (!(eventListeners instanceof Set)) {
        return;
    }

    for (const handler of eventListeners) {
        try {
            handler(payload);
        } catch (e) {
            console.error(`[Zenith Router] Error in ${eventName} listener:`, e);
        }
    }
}
