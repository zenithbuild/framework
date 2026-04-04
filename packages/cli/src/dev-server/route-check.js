import { appLocalRedirectLocation, stripBasePath } from '../base-path.js';
import { sanitizeRouteResult } from '../server-error.js';
import { executeServerRoute } from '../preview.js';
import { resolveRequestRoute } from '../server/resolve-request-route.js';

export async function handleRouteCheckRequest({
    req,
    res,
    url,
    configuredBasePath,
    routeCheckEnabled,
    state,
    loadRoutesForRequests
}) {
    try {
        if (!routeCheckEnabled) {
            res.writeHead(501, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ error: 'route_check_unsupported' }));
            return;
        }
        if (!state.initialBuildSettled && state.buildStatus === 'building') {
            res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({
                error: 'initial_build_pending',
                message: 'initial build still in progress'
            }));
            return;
        }

        // Security: Require explicitly designated header to prevent public oracle probing
        if (req.headers['x-zenith-route-check'] !== '1') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'forbidden', message: 'invalid request context' }));
            return;
        }

        const targetPath = String(url.searchParams.get('path') || '/');

        // Security: Prevent protocol/domain injection in path
        if (targetPath.includes('://') || targetPath.startsWith('//') || /[\r\n]/.test(targetPath)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_path_format' }));
            return;
        }

        const targetUrl = new URL(targetPath, url.origin);
        if (targetUrl.origin !== url.origin) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'external_route_evaluation_forbidden' }));
            return;
        }
        const canonicalTargetPath = stripBasePath(targetUrl.pathname, configuredBasePath);
        if (canonicalTargetPath === null) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'route_not_found' }));
            return;
        }
        const canonicalTargetUrl = new URL(targetUrl.toString());
        canonicalTargetUrl.pathname = canonicalTargetPath;

        const routes = await loadRoutesForRequests();
        const resolvedCheck = resolveRequestRoute(canonicalTargetUrl, routes.pageRoutes || []);
        if (!resolvedCheck.matched || !resolvedCheck.route) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'route_not_found' }));
            return;
        }

        const checkResult = await executeServerRoute({
            source: resolvedCheck.route.server_script || '',
            sourcePath: resolvedCheck.route.server_script_path || '',
            params: resolvedCheck.params,
            requestUrl: targetUrl.toString(),
            requestMethod: req.method || 'GET',
            requestHeaders: req.headers,
            routePattern: resolvedCheck.route.path,
            routeFile: resolvedCheck.route.server_script_path || '',
            routeId: resolvedCheck.route.route_id || '',
            guardOnly: true
        });
        // Security: Enforce relative or same-origin redirects
        if (checkResult && checkResult.result && checkResult.result.kind === 'redirect') {
            const loc = appLocalRedirectLocation(checkResult.result.location || '/', configuredBasePath);
            checkResult.result.location = loc;
            if (loc.includes('://') || loc.startsWith('//')) {
                try {
                    const parsedLoc = new URL(loc);
                    if (parsedLoc.origin !== targetUrl.origin) {
                        checkResult.result.location = appLocalRedirectLocation('/', configuredBasePath);
                    }
                } catch {
                    checkResult.result.location = appLocalRedirectLocation('/', configuredBasePath);
                }
            }
        }

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Vary': 'Cookie'
        });
        res.end(JSON.stringify({
            result: sanitizeRouteResult(checkResult?.result || checkResult),
            routeId: resolvedCheck.route.route_id || '',
            to: targetUrl.toString()
        }));
        return;
    } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'route_check_failed' }));
    }
}
