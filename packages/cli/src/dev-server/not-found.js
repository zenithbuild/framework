import { stripBasePath } from '../base-path.js';

export function classifyDevPath(pathname) {
    if (pathname.startsWith('/__zenith_dev/events')) return 'dev_events';
    if (pathname.startsWith('/__zenith_dev/state')) return 'dev_state';
    if (pathname.startsWith('/__zenith_dev/styles.css')) return 'dev_styles';
    if (pathname.startsWith('/assets/')) return 'asset';
    return 'other';
}

export function traceNotFound(trace, req, url, details = {}) {
    trace('http_404', {
        method: req.method || 'GET',
        url: `${url.pathname}${url.search}`,
        classify: classifyDevPath(url.pathname),
        ...details
    });
}

export function classifyNotFound(pathname) {
    const lower = String(pathname || '').toLowerCase();
    if (lower.startsWith('/__zenith_dev/')) return 'dev_internal';
    if (lower.startsWith('/__zenith/')) return 'zenith_internal';
    if (
        lower.startsWith('/_assets/')
        || lower.startsWith('/assets/')
        || lower.endsWith('.css')
        || lower.endsWith('.js')
        || lower.endsWith('.map')
        || lower.endsWith('.json')
    ) {
        return 'asset';
    }
    return 'page';
}

export function routeFileHint(pathname) {
    const normalized = String(pathname || '/').replace(/\/+$/, '');
    if (normalized === '' || normalized === '/') {
        return 'src/pages/index.zen';
    }
    return `src/pages${normalized}.zen`;
}

export function infer404Cause(category, buildStatus) {
    if (category === 'dev_internal' || category === 'zenith_internal') {
        if (buildStatus === 'error') {
            return 'initial build failed';
        }
        return 'unknown Zenith dev endpoint';
    }
    if (category === 'asset') {
        if (buildStatus === 'error') {
            return 'initial build failed';
        }
        return 'asset not emitted by latest build';
    }
    return null;
}

export function looksLikeJsonRequest(req, pathname) {
    const accept = String(req.headers.accept || '').toLowerCase();
    const secFetchDest = String(req.headers['sec-fetch-dest'] || '').toLowerCase();
    if (accept.includes('application/json') || accept.includes('application/problem+json')) {
        return true;
    }
    if (pathname.endsWith('.json')) {
        return true;
    }
    return secFetchDest === 'empty';
}

export function buildNotFoundPayload({
    pathname,
    category,
    cause,
    buildId,
    buildStatus,
    configuredBasePath,
    currentCssHref
}) {
    const hintedPath = category === 'page'
        ? (stripBasePath(pathname, configuredBasePath) || pathname)
        : pathname;
    const payload = {
        kind: 'zenith_dev_not_found',
        category,
        requestedPath: pathname,
        buildId,
        buildStatus,
        cause: cause || ''
    };

    if (category === 'asset') {
        payload.hint = buildStatus === 'error'
            ? 'Dev server is running but initial build failed; fix compile errors and refresh.'
            : 'Check emitted assets in dist and verify the requested path.';
        if (pathname.endsWith('.css')) {
            payload.expectedCssHref = currentCssHref || null;
            payload.hint = buildStatus === 'error'
                ? `Dev server is running but initial build failed; expected CSS at ${currentCssHref || '<none>'}.`
                : `Requested CSS is missing; expected current href ${currentCssHref || '<none>'}.`;
        }
        return payload;
    }

    if (category === 'dev_internal' || category === 'zenith_internal') {
        payload.hint = buildStatus === 'error'
            ? 'Dev server is running but initial build failed; restart after fixing compile errors.'
            : 'Check Zenith dev endpoint path and dev client version.';
        payload.docsLink = '/docs/documentation/contracts/hmr-v1-contract.md';
        return payload;
    }

    const routeFile = routeFileHint(hintedPath);
    payload.routeFile = routeFile;
    payload.cause = `no route file found at ${routeFile}`;
    payload.hint = `Create ${routeFile} or verify router manifest output.`;
    return payload;
}

export function renderNotFoundHtml(payload) {
    const escaped = (value) => String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
    const details = [
        `Requested: ${payload.requestedPath}`,
        `Category: ${payload.category}`,
        `Build: ${payload.buildStatus} (id=${payload.buildId})`,
        `Cause: ${payload.cause}`,
        payload.expectedCssHref ? `Expected CSS href: ${payload.expectedCssHref}` : '',
        `Hint: ${payload.hint || 'Inspect dev server output.'}`,
        payload.docsLink ? `Docs: ${payload.docsLink}` : ''
    ].filter(Boolean).join('\n');
    return [
        '<!DOCTYPE html>',
        '<html><head><meta charset="utf-8"><title>Zenith Dev 404</title></head>',
        '<body style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; padding: 20px; background: #101216; color: #e6edf3;">',
        '<h1 style="margin-top:0;">Zenith Dev 404</h1>',
        `<pre style="white-space: pre-wrap; line-height: 1.5;">${escaped(details)}</pre>`,
        '</body></html>'
    ].join('');
}
