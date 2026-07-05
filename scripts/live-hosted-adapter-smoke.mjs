#!/usr/bin/env node

const SUPPORTED_PROVIDERS = new Set(['vercel', 'netlify']);

export function parseArgs(argv = []) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg.startsWith('--')) {
            throw new Error(`Unexpected argument: ${arg}`);
        }
        const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
        const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
        const value = inlineValue ?? argv[index + 1];
        if (inlineValue === undefined) {
            index += 1;
        }
        if (value === undefined || value.startsWith('--')) {
            throw new Error(`Missing value for --${rawKey}`);
        }
        options[key] = value;
    }
    return normalizeOptions(options);
}

function normalizeOptions(options) {
    const provider = String(options.provider || '').trim().toLowerCase();
    if (!SUPPORTED_PROVIDERS.has(provider)) {
        throw new Error('Expected --provider to be "vercel" or "netlify"');
    }

    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const basePath = normalizeBasePath(options.basePath || '/');
    return { provider, baseUrl, basePath };
}

function normalizeBaseUrl(value) {
    if (!value) {
        throw new Error('Expected --base-url');
    }
    const url = new URL(String(value));
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('--base-url must be http or https');
    }
    if (url.pathname !== '/' || url.search || url.hash) {
        throw new Error('--base-url must be an origin only; use --base-path for mounted apps');
    }
    url.pathname = '/';
    return url.toString().replace(/\/$/, '');
}

function normalizeBasePath(value) {
    const trimmed = String(value || '/').trim();
    if (trimmed === '/' || trimmed === '') {
        return '';
    }
    if (!trimmed.startsWith('/') || trimmed.endsWith('/')) {
        throw new Error('--base-path must start with "/" and must not end with "/"');
    }
    return trimmed;
}

function publicPath(basePath, path) {
    return `${basePath}${path}`;
}

function publicUrl(baseUrl, basePath, path) {
    return new URL(publicPath(basePath, path), `${baseUrl}/`).toString();
}

async function tryReadJson(response) {
    const text = await response.text();
    try {
        return { value: JSON.parse(text), error: null };
    } catch {
        return { value: null, error: `Expected JSON response, received: ${text.slice(0, 160)}` };
    }
}

function check(name, condition, detail = '') {
    return { name, ok: Boolean(condition), detail };
}

export async function runHostedAdapterSmoke(options, dependencies = {}) {
    const normalized = normalizeOptions(options);
    const fetchImpl = dependencies.fetch || globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
        throw new Error('Global fetch is unavailable; use Node 18+');
    }

    const checks = [];
    const deniedUrl = publicUrl(normalized.baseUrl, normalized.basePath, '/secure?auth=no');
    const allowedUrl = publicUrl(normalized.baseUrl, normalized.basePath, '/secure?auth=yes');
    const routeCheckUrl = (targetPath) => {
        const encoded = encodeURIComponent(publicPath(normalized.basePath, targetPath));
        return publicUrl(normalized.baseUrl, normalized.basePath, `/__zenith/route-check?path=${encoded}`);
    };

    const denied = await fetchImpl(deniedUrl, { redirect: 'manual' });
    const deniedLocation = denied.headers.get('location') || '';
    checks.push(check(
        'guarded direct request redirects when denied',
        denied.status >= 300 && denied.status < 400 && deniedLocation.includes('/login'),
        `status=${denied.status} location=${deniedLocation || '<missing>'}`
    ));

    const allowed = await fetchImpl(allowedUrl, { redirect: 'manual' });
    const allowedBody = await allowed.text();
    checks.push(check(
        'guarded direct request renders when allowed',
        allowed.status === 200 && allowedBody.includes('Secure'),
        `status=${allowed.status}`
    ));

    const routeCheckHeaders = { 'x-zenith-route-check': '1' };
    const deniedCheck = await fetchImpl(routeCheckUrl('/secure?auth=no'), { headers: routeCheckHeaders });
    const deniedPayload = await tryReadJson(deniedCheck);
    checks.push(check(
        'route-check returns sanitized redirect for denied guarded route',
        deniedCheck.status === 200 &&
            deniedPayload.value?.result?.kind === 'redirect' &&
            deniedPayload.value.result.status === 307 &&
            String(deniedPayload.value.result.location || '').includes('/login'),
        deniedPayload.error || `status=${deniedCheck.status} result=${JSON.stringify(deniedPayload.value?.result || null)}`
    ));

    const allowedCheck = await fetchImpl(routeCheckUrl('/secure?auth=yes'), { headers: routeCheckHeaders });
    const allowedPayload = await tryReadJson(allowedCheck);
    checks.push(check(
        'route-check allows permitted guarded route',
        allowedCheck.status === 200 && allowedPayload.value?.result?.kind === 'allow',
        allowedPayload.error || `status=${allowedCheck.status} result=${JSON.stringify(allowedPayload.value?.result || null)}`
    ));

    const missingHeader = await fetchImpl(routeCheckUrl('/secure?auth=yes'));
    checks.push(check(
        'route-check rejects missing internal header',
        missingHeader.status === 403,
        `status=${missingHeader.status}`
    ));

    const resourceCheck = await fetchImpl(routeCheckUrl('/api/ping'), { headers: routeCheckHeaders });
    const resourcePayload = await tryReadJson(resourceCheck);
    checks.push(check(
        'route-check excludes resource routes from soft-navigation preflight',
        resourceCheck.status === 404 && resourcePayload.value?.error === 'route_not_found',
        resourcePayload.error || `status=${resourceCheck.status} body=${JSON.stringify(resourcePayload.value)}`
    ));

    return {
        provider: normalized.provider,
        baseUrl: normalized.baseUrl,
        basePath: normalized.basePath || '/',
        checks,
        ok: checks.every((entry) => entry.ok)
    };
}

function printResult(result) {
    console.log(`# ${result.provider} hosted adapter smoke`);
    console.log(`baseUrl=${result.baseUrl}`);
    console.log(`basePath=${result.basePath}`);
    for (const entry of result.checks) {
        console.log(`${entry.ok ? 'ok' : 'FAIL'} - ${entry.name}${entry.detail ? ` (${entry.detail})` : ''}`);
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const result = await runHostedAdapterSmoke(options);
    printResult(result);
    if (!result.ok) {
        process.exitCode = 1;
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
