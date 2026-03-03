// ---------------------------------------------------------------------------
// events.ts — Zenith Router V0
// ---------------------------------------------------------------------------
// Route change event system.
//
// Subscribers receive route change notifications.
// Returns unsubscribe function.
// No batching. No queue. Synchronous dispatch.
// ---------------------------------------------------------------------------

type RouteParams = Record<string, string>;

type RouteChangeDetail = {
    path: string;
    params?: RouteParams;
    matched: boolean;
};

type RouteProtectionPolicy = {
    beforeResolve?: boolean;
    emitRedirects?: boolean;
};

type RouteEventHandler = (payload: unknown) => void;
type RouteEventListeners = Record<string, Set<RouteEventHandler>>;
type RouteProtectionScope = typeof globalThis & {
    __zenith_route_protection_policy?: RouteProtectionPolicy;
    __zenith_route_event_listeners?: RouteEventListeners;
};

const subscribers = new Set<(detail: RouteChangeDetail) => void>();

export function onRouteChange(callback: (detail: RouteChangeDetail) => void): () => void {
    subscribers.add(callback);

    return () => {
        subscribers.delete(callback);
    };
}

export function _dispatchRouteChange(detail: RouteChangeDetail): void {
    for (const callback of subscribers) {
        callback(detail);
    }
}

export function _clearSubscribers(): void {
    subscribers.clear();
}

export function _getSubscriberCount(): number {
    return subscribers.size;
}

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
] as const;

function getRouteProtectionScope(): RouteProtectionScope {
    return typeof globalThis === 'object' && globalThis
        ? (globalThis as RouteProtectionScope)
        : ({} as RouteProtectionScope);
}

function ensureRouteProtectionState(): { policy: RouteProtectionPolicy; listeners: RouteEventListeners } {
    const scope = getRouteProtectionScope();

    let policy = scope[ROUTE_POLICY_KEY];
    if (!policy || typeof policy !== 'object') {
        policy = {};
        scope[ROUTE_POLICY_KEY] = policy;
    }

    let listeners = scope[ROUTE_EVENT_LISTENERS_KEY];
    if (!listeners || typeof listeners !== 'object') {
        listeners = Object.create(null) as RouteEventListeners;
        scope[ROUTE_EVENT_LISTENERS_KEY] = listeners;
    }

    for (const eventName of ROUTE_EVENT_NAMES) {
        if (!(listeners[eventName] instanceof Set)) {
            listeners[eventName] = new Set();
        }
    }

    return { policy, listeners };
}

export function setRouteProtectionPolicy(policy: RouteProtectionPolicy): void {
    const state = ensureRouteProtectionState();
    state.policy = Object.assign({}, state.policy, policy);
    getRouteProtectionScope()[ROUTE_POLICY_KEY] = state.policy;
}

export function _getRouteProtectionPolicy(): RouteProtectionPolicy {
    return ensureRouteProtectionState().policy;
}

export function on(eventName: string, handler: RouteEventHandler): void {
    const eventListeners = ensureRouteProtectionState().listeners[eventName];
    if (eventListeners instanceof Set) {
        eventListeners.add(handler);
    }
}

export function off(eventName: string, handler: RouteEventHandler): void {
    const eventListeners = ensureRouteProtectionState().listeners[eventName];
    if (eventListeners instanceof Set) {
        eventListeners.delete(handler);
    }
}

export function _dispatchRouteEvent(eventName: string, payload: unknown): void {
    const eventListeners = ensureRouteProtectionState().listeners[eventName];
    if (!(eventListeners instanceof Set)) {
        return;
    }

    for (const handler of eventListeners) {
        try {
            handler(payload);
        } catch (error) {
            console.error(`[Zenith Router] Error in ${eventName} listener:`, error);
        }
    }
}
