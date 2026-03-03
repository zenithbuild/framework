export interface SemverVersion {
    major: number;
    minor: number;
    patch: number;
}

export function parseSemver(version: string): SemverVersion {
    const cleaned = version.replace(/^v/, '');
    const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
        throw new Error(`[Zenith:Version] Invalid semver: "${version}"`);
    }
    return {
        major: Number.parseInt(match[1]!, 10),
        minor: Number.parseInt(match[2]!, 10),
        patch: Number.parseInt(match[3]!, 10)
    };
}

export function formatVersion(ver: SemverVersion): string {
    return `${ver.major}.${ver.minor}.${ver.patch}`;
}

export function validateCompatibility(coreVersion: string, otherVersion: string): string | null {
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
