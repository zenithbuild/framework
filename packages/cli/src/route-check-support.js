const ROUTE_CHECK_UNSUPPORTED_TARGETS = new Set(['vercel', 'netlify']);

export function supportsTargetRouteCheck(target) {
    return !ROUTE_CHECK_UNSUPPORTED_TARGETS.has(String(target || '').trim());
}
