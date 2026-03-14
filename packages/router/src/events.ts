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
    onDeny?: 'stay' | 'redirect' | 'render403' | ((ctx: any) => void);
    defaultLoginPath?: string;
    deny401RedirectToLogin?: boolean;
    forbiddenPath?: string;
};

type RouteEventHandler = (payload: unknown) => void | Promise<void>;
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
    'route:redirect',
    'navigation:request',
    'navigation:before-leave',
    'navigation:leave-complete',
    'navigation:data-ready',
    'navigation:before-swap',
    'navigation:content-swapped',
    'navigation:before-enter',
    'navigation:enter-complete',
    'navigation:abort',
    'navigation:error'
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

function dispatchRouteEventError(eventName: string, payload: unknown, error: unknown): void {
    console.error(`[Zenith Router] Error in ${eventName} listener:`, error);
    if (
        eventName === 'navigation:error' ||
        !payload ||
        typeof payload !== 'object' ||
        typeof (payload as Record<string, unknown>).navigationId !== 'number'
    ) {
        return;
    }

    _dispatchRouteEvent('navigation:error', {
        navigationId: (payload as Record<string, unknown>).navigationId,
        navigationType: (payload as Record<string, unknown>).navigationType,
        to: (payload as Record<string, unknown>).to,
        from: (payload as Record<string, unknown>).from,
        routeId: (payload as Record<string, unknown>).routeId,
        params: (payload as Record<string, unknown>).params,
        stage: (payload as Record<string, unknown>).stage ?? 'listener',
        reason: 'listener-error',
        hook: eventName,
        error
    });
}

export function _dispatchRouteEvent(eventName: string, payload: unknown): void {
    const eventListeners = ensureRouteProtectionState().listeners[eventName];
    if (!(eventListeners instanceof Set)) {
        return;
    }

    for (const handler of eventListeners) {
        try {
            const result = handler(payload);
            if (result && typeof (result as Promise<unknown>).catch === 'function') {
                (result as Promise<unknown>).catch((error) => {
                    dispatchRouteEventError(eventName, payload, error);
                });
            }
        } catch (error) {
            dispatchRouteEventError(eventName, payload, error);
        }
    }
}

export async function _dispatchRouteEventAsync(eventName: string, payload: unknown): Promise<void> {
    const eventListeners = ensureRouteProtectionState().listeners[eventName];
    if (!(eventListeners instanceof Set)) {
        return;
    }

    const handlers = Array.from(eventListeners);
    for (const handler of handlers) {
        try {
            await handler(payload);
        } catch (error) {
            dispatchRouteEventError(eventName, payload, error);
        }
    }
}

export function _clearRouteEventListeners(): void {
    const listeners = ensureRouteProtectionState().listeners;
    for (const eventName of Object.keys(listeners)) {
        if (listeners[eventName] instanceof Set) {
            listeners[eventName].clear();
        }
    }
}
