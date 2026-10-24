export function classifyPageRoute({ file, serverScript, hasScopedServerData = false }) {
    const hasGuard = serverScript?.has_guard === true;
    const hasLoad = serverScript?.has_load === true;
    const hasAction = serverScript?.has_action === true;
    const prerender = serverScript?.prerender === true;

    if (prerender && (hasGuard || hasLoad || hasAction)) {
        throw new Error(
            `[zenith] Build failed for ${file}: protected routes require SSR/runtime. ` +
            'Cannot prerender a static route with a `guard`, `load`, or `action` function.'
        );
    }

    if (prerender && hasScopedServerData) {
        throw new Error(
            `[zenith] Build failed for ${file}: CSV012 scoped server data cannot be combined with prerender=true in v1.`
        );
    }

    const needsServerRender = !prerender && (Boolean(serverScript) || hasScopedServerData);

    return {
        prerender,
        renderMode: needsServerRender ? 'server' : 'prerender',
        hasGuard,
        hasLoad,
        hasAction
    };
}
