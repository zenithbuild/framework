// ---------------------------------------------------------------------------
// version.js — Zenith Core V0
// ---------------------------------------------------------------------------
// SemVer parsing and compatibility validation.
//
// Direction of control: Other layers call core's version utility.
// Core never imports other packages to auto-check.
// ---------------------------------------------------------------------------

/**
 * Parse a SemVer string into components.
 *
 * @param {string} version  e.g. "1.2.3"
 * @returns {{ major: number, minor: number, patch: number }}
 */
export function parseSemver(version) {
    const cleaned = version.replace(/^v/, '');
    const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
        throw new Error(`[Zenith:Version] Invalid semver: "${version}"`);
    }
    return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10)
    };
}

/**
 * Format a version object back to a string.
 *
 * @param {{ major: number, minor: number, patch: number }} ver
 * @returns {string}
 */
export function formatVersion(ver) {
    return `${ver.major}.${ver.minor}.${ver.patch}`;
}

/**
 * Validate compatibility between two versions.
 *
 * Rules:
 * - Major versions must match (throws if different)
 * - Minor version difference > 1 produces a warning (returns warning string)
 * - Otherwise returns null (compatible)
 *
 * @param {string} coreVersion
 * @param {string} otherVersion
 * @returns {string|null}  Warning message or null if fully compatible
 */
export function validateCompatibility(coreVersion, otherVersion) {
    const core = parseSemver(coreVersion);
    const other = parseSemver(otherVersion);

    if (core.major !== other.major) {
        throw new Error(
            `[Zenith:Version] Incompatible major versions: core=${formatVersion(core)}, other=${formatVersion(other)}`
        );
    }

    const minorDiff = Math.abs(core.minor - other.minor);
    if (minorDiff > 1) {
        return `[Zenith:Version] Minor version drift: core=${formatVersion(core)}, other=${formatVersion(other)} (diff=${minorDiff})`;
    }

    return null;
}
