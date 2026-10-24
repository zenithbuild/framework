// ---------------------------------------------------------------------------
// env.ts — Zenith Runtime canonical environment accessors
// ---------------------------------------------------------------------------
// SSR-safe access to window and document. Returns null when not in browser.
// Use zenWindow() / zenDocument() instead of direct window/document access.
// ---------------------------------------------------------------------------

/** Canonical public access to window */
export function zenWindow(): Window | null {
    return typeof globalThis.window === 'undefined' ? null : globalThis.window;
}

/** Canonical public access to document */
export function zenDocument(): Document | null {
    return typeof globalThis.document === 'undefined' ? null : globalThis.document;
}

/** 
 * @alias zenWindow 
 * @description Optional secondary alias for the canonical zenWindow primitive.
 */
export function window(): Window | null {
    return zenWindow();
}

/** 
 * @alias zenDocument 
 * @description Optional secondary alias for the canonical zenDocument primitive.
 */
export function document(): Document | null {
    return zenDocument();
}
