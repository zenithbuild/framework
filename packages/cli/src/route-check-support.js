const ROUTE_CHECK_UNSUPPORTED_TARGETS = new Set(['static-export']);

export function supportsTargetRouteCheck(target) {
    return !ROUTE_CHECK_UNSUPPORTED_TARGETS.has(String(target || '').trim());
}
