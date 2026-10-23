import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertJsonSerializable } from '../server-contract.js';

export const SESSION_COOKIE_NAME = 'zenith_session';
export const SESSION_SECRET_ENV = 'ZENITH_SESSION_SECRET';
export const STAGED_SET_COOKIES_KEY = '__zenith_staged_set_cookies';
export const AUTH_CONTROL_FLOW_FLAG = '__zenith_auth_control_flow';

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const SESSION_COOKIE_MAX_BYTES = 3800;
const SESSION_SCHEMA_VERSION = 1;

function createAuthError(message) {
    return new Error(`[Zenith] ${message}`);
}

function base64urlEncode(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64urlDecode(input) {
    const normalized = String(input || '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
}

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype || proto?.constructor?.name === 'Object';
}

function readSessionSecret() {
    const secret = typeof process?.env?.[SESSION_SECRET_ENV] === 'string'
        ? process.env[SESSION_SECRET_ENV].trim()
        : '';
    if (!secret) {
        throw createAuthError(`ctx.auth requires ${SESSION_SECRET_ENV} to be set`);
    }
    return secret;
}

function signPayload(payload, secret) {
    return createHmac('sha256', secret).update(payload).digest('base64url');
}

function createSignedSessionValue(session, secret) {
    if (!isPlainObject(session)) {
        throw createAuthError('ctx.auth.signIn(sessionObject) requires a JSON-safe plain object');
    }
    assertJsonSerializable(session, 'ctx.auth.signIn(sessionObject)');

    const envelope = {
        v: SESSION_SCHEMA_VERSION,
        exp: Date.now() + SESSION_COOKIE_MAX_AGE_SECONDS * 1000,
        session
    };
    const json = JSON.stringify(envelope);
    const encodedPayload = base64urlEncode(json);
    const signature = signPayload(encodedPayload, secret);
    const token = `${encodedPayload}.${signature}`;

    if (Buffer.byteLength(token, 'utf8') > SESSION_COOKIE_MAX_BYTES) {
        throw createAuthError('ctx.auth.signIn(sessionObject) produced an oversized session cookie');
    }
    return token;
}

function parseSessionValue(rawValue, secret) {
    if (typeof rawValue !== 'string' || rawValue.length === 0) {
        return null;
    }
    const dot = rawValue.lastIndexOf('.');
    if (dot <= 0 || dot === rawValue.length - 1) {
        return null;
    }

    const encodedPayload = rawValue.slice(0, dot);
    const receivedSignature = rawValue.slice(dot + 1);
    const expectedSignature = signPayload(encodedPayload, secret);
    const received = Buffer.from(receivedSignature);
    const expected = Buffer.from(expectedSignature);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
        return null;
    }

    try {
        const envelope = JSON.parse(base64urlDecode(encodedPayload));
        if (!envelope || typeof envelope !== 'object' || envelope.v !== SESSION_SCHEMA_VERSION) {
            return null;
        }
        if (!Number.isFinite(envelope.exp) || envelope.exp <= Date.now()) {
            return null;
        }
        if (!isPlainObject(envelope.session)) {
            return null;
        }
        assertJsonSerializable(envelope.session, 'ctx.auth session payload');
        return envelope.session;
    } catch {
        return null;
    }
}

function shouldUseSecureCookies(requestUrl) {
    try {
        const url = requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl || 'http://localhost/'));
        return url.protocol === 'https:';
    } catch {
        return false;
    }
}

function buildCookieAttributes(requestUrl) {
    const attributes = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
    if (shouldUseSecureCookies(requestUrl)) {
        attributes.push('Secure');
    }
    return attributes;
}

function buildSessionSetCookie(value, requestUrl) {
    const attributes = buildCookieAttributes(requestUrl);
    attributes.push(`Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`);
    attributes.push(`Expires=${new Date(Date.now() + SESSION_COOKIE_MAX_AGE_SECONDS * 1000).toUTCString()}`);
    return `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; ${attributes.join('; ')}`;
}

function buildSessionClearCookie(requestUrl) {
    const attributes = buildCookieAttributes(requestUrl);
    attributes.push('Max-Age=0');
    attributes.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    return `${SESSION_COOKIE_NAME}=; ${attributes.join('; ')}`;
}

function stageSetCookie(ctx, value) {
    if (!Array.isArray(ctx[STAGED_SET_COOKIES_KEY])) {
        Object.defineProperty(ctx, STAGED_SET_COOKIES_KEY, {
            value: [],
            enumerable: false,
            configurable: true
        });
    }
    ctx[STAGED_SET_COOKIES_KEY].push(value);
}

function toAuthControlFlow(result) {
    const error = new Error('auth control flow');
    error[AUTH_CONTROL_FLOW_FLAG] = true;
    error.result = result;
    return error;
}

function normalizeRequirePolicy(options, redirect, deny) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw createAuthError('ctx.auth.requireSession(...) requires an explicit redirect or deny policy object');
    }

    const hasRedirect = typeof options.redirectTo === 'string' && options.redirectTo.trim().length > 0;
    const hasDeny = Number.isInteger(options.deny);
    if (hasRedirect === hasDeny) {
        throw createAuthError('ctx.auth.requireSession(...) requires exactly one of redirectTo or deny');
    }

    if (hasRedirect) {
        const status = options.status === undefined ? 302 : options.status;
        if (status !== 302 && status !== 303 && status !== 307) {
            throw createAuthError('ctx.auth.requireSession({ redirectTo, status }) only supports 302, 303, or 307');
        }
        return redirect(options.redirectTo, status);
    }

    if (options.deny !== 401 && options.deny !== 403 && options.deny !== 404) {
        throw createAuthError('ctx.auth.requireSession({ deny, message }) only supports 401, 403, or 404');
    }
    if (options.message !== undefined && typeof options.message !== 'string') {
        throw createAuthError('ctx.auth.requireSession({ deny, message }) requires message to be a string when provided');
    }
    return deny(options.deny, options.message);
}

export function consumeStagedSetCookies(ctx) {
    if (!ctx || typeof ctx !== 'object' || !Array.isArray(ctx[STAGED_SET_COOKIES_KEY])) {
        return [];
    }
    return ctx[STAGED_SET_COOKIES_KEY].slice();
}

export function attachRouteAuth(ctx, options = {}) {
    if (!ctx || typeof ctx !== 'object') {
        throw createAuthError('attachRouteAuth(ctx) requires a route context object');
    }

    const requestUrl = options.requestUrl instanceof URL
        ? options.requestUrl
        : new URL(String(options.requestUrl || ctx.url || 'http://localhost/'));
    const guardOnly = options.guardOnly === true;
    const redirect = options.redirect;
    const deny = options.deny;

    if (typeof redirect !== 'function' || typeof deny !== 'function') {
        throw createAuthError('attachRouteAuth(ctx) requires redirect() and deny() constructors');
    }
    let activeSession;
    let activeSessionInitialized = false;

    function readActiveSession() {
        if (activeSessionInitialized) {
            return activeSession;
        }
        const secret = readSessionSecret();
        const rawCookieValue = typeof ctx.cookies?.[SESSION_COOKIE_NAME] === 'string'
            ? ctx.cookies[SESSION_COOKIE_NAME]
            : '';
        activeSession = parseSessionValue(rawCookieValue, secret);
        activeSessionInitialized = true;
        return activeSession;
    }

    Object.defineProperty(ctx, STAGED_SET_COOKIES_KEY, {
        value: [],
        enumerable: false,
        configurable: true
    });

    ctx.auth = {
        async getSession() {
            return readActiveSession();
        },

        async requireSession(policy) {
            const session = await this.getSession();
            if (session) {
                return session;
            }
            throw toAuthControlFlow(normalizeRequirePolicy(policy, redirect, deny));
        },

        async signIn(sessionObject) {
            if (guardOnly) {
                throw createAuthError('ctx.auth.signIn(...) is unavailable during advisory route-check execution');
            }
            const secret = readSessionSecret();
            const cookieValue = createSignedSessionValue(sessionObject, secret);
            stageSetCookie(ctx, buildSessionSetCookie(cookieValue, requestUrl));
            activeSession = sessionObject;
            activeSessionInitialized = true;
        },

        async signOut() {
            if (guardOnly) {
                throw createAuthError('ctx.auth.signOut() is unavailable during advisory route-check execution');
            }
            stageSetCookie(ctx, buildSessionClearCookie(requestUrl));
            activeSession = null;
            activeSessionInitialized = true;
        }
    };

    return ctx.auth;
}
