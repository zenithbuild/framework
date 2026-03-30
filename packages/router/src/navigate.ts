// ---------------------------------------------------------------------------
// navigate.ts — Zenith Router V0
// ---------------------------------------------------------------------------
// Navigation API.
//
// - navigate(path)    → push to history, trigger route change
// - refreshCurrentRoute() → rerun the current matched route without pushing history
// - back()            → history.back()
// - forward()         → history.forward()
// - getCurrentPath()  → current pathname
//
// The navigate function accepts a resolver callback so the router
// can wire match → mount logic without circular dependencies.
// ---------------------------------------------------------------------------

import { current, push } from './history.js';

let resolveNavigation: ((path: string) => Promise<void>) | null = null;
let resolveRefresh: (() => Promise<void>) | null = null;
const ROUTER_REFRESH_KEY = '__zenith_refresh_current_route';

type RouterRefreshScope = typeof globalThis & {
    [ROUTER_REFRESH_KEY]?: (() => Promise<void>) | undefined;
};

export function _setNavigationResolver(resolver: ((path: string) => Promise<void>) | null): void {
    resolveNavigation = resolver;
}

export function _setRefreshResolver(resolver: (() => Promise<void>) | null): void {
    resolveRefresh = resolver;
}

export async function navigate(path: string): Promise<void> {
    push(path);

    if (resolveNavigation) {
        await resolveNavigation(path);
    }
}

export async function refreshCurrentRoute(): Promise<void> {
    const scope = typeof globalThis === 'object' && globalThis
        ? (globalThis as RouterRefreshScope)
        : ({} as RouterRefreshScope);
    const resolver = resolveRefresh || scope[ROUTER_REFRESH_KEY] || null;
    if (typeof resolver !== 'function') {
        throw new Error('[Zenith Router] refreshCurrentRoute() requires a current matched Zenith page route');
    }
    await resolver();
}

export function back(): void {
    history.back();
}

export function forward(): void {
    history.forward();
}

export function getCurrentPath(): string {
    return current();
}
