// ---------------------------------------------------------------------------
// env.ts — Zenith Runtime canonical environment accessors
// ---------------------------------------------------------------------------
// SSR-safe access to window and document. Returns null when not in browser.
// Use zenWindow() / zenDocument() instead of direct window/document access.
// ---------------------------------------------------------------------------

export function zenWindow(): Window | null {
    return typeof window === 'undefined' ? null : window;
}

export function zenDocument(): Document | null {
    return typeof document === 'undefined' ? null : document;
}
