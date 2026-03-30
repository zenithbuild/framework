const HOSTED_RESOURCE_DOWNLOAD_RE = /\b(?:ctx\.)?download\s*\(/;

export function validateHostedResourceRoutes(manifest, targetName) {
    for (const route of Array.isArray(manifest) ? manifest : []) {
        if (route?.route_kind !== 'resource') {
            continue;
        }
        const source = typeof route.server_script === 'string' ? route.server_script : '';
        if (HOSTED_RESOURCE_DOWNLOAD_RE.test(source)) {
            throw new Error(
                `[Zenith:Build] target "${targetName}" does not support resource downloads in this milestone. ` +
                `Route "${route.path}" (${route.file}) must run on dev, preview, or target "node".`
            );
        }
    }
}
