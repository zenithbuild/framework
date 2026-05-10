export function classifyPageRoute({ file, serverScript }) {
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

    return {
        prerender,
        renderMode: serverScript && !prerender ? 'server' : 'prerender',
        hasGuard,
        hasLoad,
        hasAction
    };
}
