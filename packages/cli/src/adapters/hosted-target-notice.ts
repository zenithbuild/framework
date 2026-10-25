const HOST_LABELS: Record<string, string> = {
    vercel: 'Vercel',
    netlify: 'Netlify'
};

function hostedHostKey(target: string): string | null {
    if (target === 'vercel' || target === 'netlify') {
        return target;
    }
    if (!target.endsWith('-static')) {
        return null;
    }
    const hostKey = target.slice(0, -'-static'.length);
    if (hostKey.length === 0) {
        return null;
    }
    return hostKey;
}

function titleCaseHost(hostKey: string): string {
    return `${hostKey.charAt(0).toUpperCase()}${hostKey.slice(1)}`;
}

/**
 * One-line build notice for hosted targets.
 * static, static-export, and node are omitted so a build does not claim
 * host live-verification for targets that are not hosted.
 */
export function hostedTargetVerificationNotice(target: string): string | null {
    const hostKey = hostedHostKey(target);
    if (!hostKey) {
        return null;
    }
    const host = HOST_LABELS[hostKey] ?? titleCaseHost(hostKey);
    return `Target "${target}" is built and conformance-tested; not live-verified on ${host}.`;
}
