// ---------------------------------------------------------------------------
// ref.js — Zenith Runtime ref primitive
// ---------------------------------------------------------------------------
// A structural DOM pointer. NOT reactive.
// ref.current is a plain property — no tracking, no proxies, no subscriptions.
//
// Contract:
//   - ref() returns { current: null }
//   - ref(initialValue) returns { current: initialValue }
//   - .current is assigned by runtime at mount, before zenMount callbacks run
//   - .current is set to null on component disposal
//   - Reading .current does NOT register a dependency in zenEffect

/**
 * Create a deterministic ref for structural DOM binding.
 *
 * @template T
 * @param {T} [initialValue]
 * @returns {{ current: T | null }}
 */
export function ref(initialValue) {
    return { current: initialValue ?? null };
}
