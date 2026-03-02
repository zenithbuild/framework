// ---------------------------------------------------------------------------
// order.js — Zenith Core V0
// ---------------------------------------------------------------------------
// Deterministic ordering utilities. Pure transforms.
//
// Sorting contract:
// 1. Static routes first, dynamic routes second
// 2. Alphabetical tiebreak within each group
// 3. Stable across runs
// ---------------------------------------------------------------------------

/**
 * Check if a route path contains dynamic segments (starts with :).
 *
 * @param {string} routePath
 * @returns {boolean}
 */
function _isDynamic(routePath) {
    return routePath.includes(':');
}

/**
 * Sort route entries deterministically.
 *
 * Rules:
 * 1. Static routes before dynamic routes
 * 2. Alphabetical (lexicographic) within each group
 *
 * Entries must have a `path` property.
 *
 * @param {{ path: string }[]} entries
 * @returns {{ path: string }[]}
 */
export function sortRoutes(entries) {
    return [...entries].sort((a, b) => {
        const aDynamic = _isDynamic(a.path);
        const bDynamic = _isDynamic(b.path);

        // Static before dynamic
        if (!aDynamic && bDynamic) return -1;
        if (aDynamic && !bDynamic) return 1;

        // Alphabetical tiebreak
        return a.path.localeCompare(b.path);
    });
}

/**
 * Sort an array of strings deterministically.
 * Simple alphabetical sort with stable ordering.
 *
 * @param {string[]} items
 * @returns {string[]}
 */
export function sortAlpha(items) {
    return [...items].sort((a, b) => a.localeCompare(b));
}

/**
 * Check if an array of route entries is in correct deterministic order.
 * Does not throw — returns boolean.
 *
 * @param {{ path: string }[]} entries
 * @returns {boolean}
 */
export function isCorrectOrder(entries) {
    const sorted = sortRoutes(entries);
    return entries.every((entry, i) => entry.path === sorted[i].path);
}
