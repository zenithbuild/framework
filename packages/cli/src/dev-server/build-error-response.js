function truncateMessage(message, limit = 1000) {
    const value = String(message || 'Dev build failed.');
    return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function buildDevErrorPayload({ pathname, state }) {
    const message = truncateMessage(state.buildError?.message || 'Dev build failed.');
    return {
        kind: 'zenith_dev_build_failed',
        requestedPath: pathname,
        buildId: state.buildId,
        pendingBuildId: state.pendingBuildId,
        buildStatus: state.buildStatus,
        error: { message },
        hint: 'Fix the build error and save again.'
    };
}

export function respondWithDevBuildError({
    req,
    res,
    pathname,
    state,
    looksLikeJsonRequest
}) {
    const payload = buildDevErrorPayload({ pathname, state });
    if (looksLikeJsonRequest(req, pathname)) {
        res.writeHead(503, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'X-Zenith-Dev-Error': 'build-failed'
        });
        res.end(JSON.stringify(payload));
        return;
    }

    res.writeHead(503, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Zenith-Dev-Error': 'build-failed'
    });
    res.end([
        '<!DOCTYPE html>',
        '<html><head><meta charset="utf-8"><title>Zenith Dev Build Failed</title></head>',
        '<body style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; padding: 20px; background: #101216; color: #e6edf3;">',
        '<h1 style="margin-top:0;">Zenith Dev Build Failed</h1>',
        `<pre style="white-space: pre-wrap; line-height: 1.5;">Requested: ${escapeHtml(pathname)}\nStatus: build failed\nError: ${escapeHtml(payload.error.message)}\nHint: ${escapeHtml(payload.hint)}</pre>`,
        '</body></html>'
    ].join(''));
}
