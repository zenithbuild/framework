#!/usr/bin/env node

function parseVersion(version) {
    const raw = String(version || '').trim();
    const match = raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
    if (!match) {
        return null;
    }
    return {
        raw,
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10),
        patch: Number.parseInt(match[3], 10),
        prerelease: match[4] || '',
        prereleaseParts: match[4] ? match[4].split('.') : []
    };
}

function compareIdentifiers(left, right) {
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
        return Number(left) - Number(right);
    }
    if (leftNumeric) {
        return -1;
    }
    if (rightNumeric) {
        return 1;
    }
    return left.localeCompare(right);
}

function compareVersions(leftVersion, rightVersion) {
    const left = parseVersion(leftVersion);
    const right = parseVersion(rightVersion);
    if (!left || !right) {
        throw new Error(`Invalid semver comparison: ${leftVersion} vs ${rightVersion}`);
    }

    const numberDelta =
        (left.major - right.major)
        || (left.minor - right.minor)
        || (left.patch - right.patch);
    if (numberDelta !== 0) {
        return numberDelta;
    }

    if (!left.prerelease && !right.prerelease) {
        return 0;
    }
    if (!left.prerelease) {
        return 1;
    }
    if (!right.prerelease) {
        return -1;
    }

    const length = Math.max(left.prereleaseParts.length, right.prereleaseParts.length);
    for (let index = 0; index < length; index += 1) {
        const leftPart = left.prereleaseParts[index];
        const rightPart = right.prereleaseParts[index];
        if (leftPart === undefined) {
            return -1;
        }
        if (rightPart === undefined) {
            return 1;
        }
        const delta = compareIdentifiers(leftPart, rightPart);
        if (delta !== 0) {
            return delta;
        }
    }

    return 0;
}

function highestPublishedVersion(json) {
    const payload = JSON.parse(json);
    const versions = Array.isArray(payload) ? payload : [payload];
    let highest = '';
    for (const version of versions) {
        if (typeof version !== 'string') {
            continue;
        }
        if (!highest || compareVersions(version, highest) > 0) {
            highest = version;
        }
    }
    return highest;
}

function latestDistTagVersion(json) {
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' && typeof payload.latest === 'string'
        ? payload.latest.trim()
        : '';
}

function usage() {
    console.error('Usage: node scripts/publish-version-utils.mjs <compare|highest|latest> <arg> [arg]');
}

function main() {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'compare') {
        if (args.length !== 2) {
            usage();
            process.exit(1);
        }
        process.stdout.write(String(compareVersions(args[0], args[1])));
        return;
    }
    if (command === 'highest') {
        if (args.length !== 1) {
            usage();
            process.exit(1);
        }
        process.stdout.write(highestPublishedVersion(args[0]));
        return;
    }
    if (command === 'latest') {
        if (args.length !== 1) {
            usage();
            process.exit(1);
        }
        process.stdout.write(latestDistTagVersion(args[0]));
        return;
    }
    usage();
    process.exit(1);
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
