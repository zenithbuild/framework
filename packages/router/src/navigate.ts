// ---------------------------------------------------------------------------
// navigate.ts — Zenith Router V0
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

import { current, push } from './history.js';

let resolveNavigation: ((path: string) => Promise<void>) | null = null;

export function _setNavigationResolver(resolver: ((path: string) => Promise<void>) | null): void {
    resolveNavigation = resolver;
}

export async function navigate(path: string): Promise<void> {
    push(path);

    if (resolveNavigation) {
        await resolveNavigation(path);
    }
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
