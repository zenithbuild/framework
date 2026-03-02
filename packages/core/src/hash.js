// ---------------------------------------------------------------------------
// hash.js — Zenith Core V0
// ---------------------------------------------------------------------------
// Deterministic content hashing. SHA-256, hex output.
//
// CRITICAL: This algorithm must match the bundler's hashing exactly.
// If bundler changes hash algorithm, core must change in lockstep.
//
// Input normalization:
//   - Path separators → /
//   - Trailing newlines stripped
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';

/**
 * Hash a string using SHA-256. Returns hex digest.
 *
 * @param {string} content
 * @returns {string}
 */
export function hash(content) {
    const normalized = _normalizeInput(content);
    return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Hash a string and return a truncated hash (first N characters).
 * Useful for content-hashed filenames.
 *
 * @param {string} content
 * @param {number} [length=8]
 * @returns {string}
 */
export function hashShort(content, length = 8) {
    return hash(content).slice(0, length);
}

/**
 * Normalize input for deterministic hashing.
 * - Replaces backslashes with forward slashes
 * - Strips trailing newlines
 *
 * @param {string} content
 * @returns {string}
 */
function _normalizeInput(content) {
    let result = content.replace(/\\/g, '/');
    // Strip trailing newlines
    result = result.replace(/\n+$/, '');
    return result;
}
