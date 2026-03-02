// ---------------------------------------------------------------------------
// env.js — Zenith Runtime canonical environment accessors
// ---------------------------------------------------------------------------
// SSR-safe access to window and document. Returns null when not in browser.
// Use zenWindow() / zenDocument() instead of direct window/document access.
// ---------------------------------------------------------------------------

/**
 * SSR-safe window accessor.
 * @returns {Window | null}
 */
export function zenWindow() {
    return typeof window === 'undefined' ? null : window;
}

/**
 * SSR-safe document accessor.
 * @returns {Document | null}
 */
export function zenDocument() {
    return typeof document === 'undefined' ? null : document;
}
