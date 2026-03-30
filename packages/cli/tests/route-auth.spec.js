import { jest } from '@jest/globals';
import {
    attachRouteAuth,
    consumeStagedSetCookies,
    SESSION_COOKIE_NAME,
    SESSION_SECRET_ENV
} from '../dist/auth/route-auth.js';

jest.setTimeout(30000);

function createRedirect(location, status = 302) {
    return {
        kind: 'redirect',
        location: String(location || ''),
        status: Number.isInteger(status) ? status : 302
    };
}

function createDeny(status = 403, message = undefined) {
    return {
        kind: 'deny',
        status: Number.isInteger(status) ? status : 403,
        message: typeof message === 'string' ? message : undefined
    };
}

function createRouteContext(cookieValue = null, options = {}) {
    const ctx = {
        cookies: cookieValue ? { [SESSION_COOKIE_NAME]: cookieValue } : {},
        url: new URL('http://localhost/account')
    };
    attachRouteAuth(ctx, {
        requestUrl: ctx.url,
        guardOnly: options.guardOnly === true,
        redirect: createRedirect,
        deny: createDeny
    });
    return ctx;
}

function extractCookieValue(setCookieHeader) {
    const pair = String(setCookieHeader || '').split(';', 1)[0];
    const eq = pair.indexOf('=');
    if (eq < 0) {
        return '';
    }
    return decodeURIComponent(pair.slice(eq + 1));
}

describe('route auth helper', () => {
    const previousSecret = process.env[SESSION_SECRET_ENV];

    beforeEach(() => {
        process.env[SESSION_SECRET_ENV] = 'zenith-test-session-secret';
    });

    afterEach(() => {
        if (previousSecret === undefined) {
            delete process.env[SESSION_SECRET_ENV];
            return;
        }
        process.env[SESSION_SECRET_ENV] = previousSecret;
    });

    test('same-request session reads reflect sign-in and sign-out staging', async () => {
        const ctx = createRouteContext();

        expect(await ctx.auth.getSession()).toBeNull();

        await ctx.auth.signIn({ userId: 'user_1', email: 'ada@zenith.dev' });
        expect(await ctx.auth.getSession()).toEqual({
            userId: 'user_1',
            email: 'ada@zenith.dev'
        });

        await ctx.auth.signOut();
        expect(await ctx.auth.getSession()).toBeNull();
    });

    test('tampered cookies behave as unauthenticated', async () => {
        const ctx = createRouteContext();
        await ctx.auth.signIn({ userId: 'user_1', email: 'ada@zenith.dev' });

        const [setCookie] = consumeStagedSetCookies(ctx);
        const cookieValue = extractCookieValue(setCookie);
        const tamperedCookieValue = `${cookieValue.slice(0, -1)}x`;
        const nextCtx = createRouteContext(tamperedCookieValue);

        expect(await nextCtx.auth.getSession()).toBeNull();
    });

    test('non-json-safe session payloads fail clearly', async () => {
        const ctx = createRouteContext();

        await expect(ctx.auth.signIn(new Date())).rejects.toThrow(
            'ctx.auth.signIn(sessionObject) requires a JSON-safe plain object'
        );
        await expect(ctx.auth.signIn({ issuedAt: new Date() })).rejects.toThrow(
            'Date is not allowed'
        );
    });

    test('oversized session payloads fail clearly', async () => {
        const ctx = createRouteContext();

        await expect(
            ctx.auth.signIn({ blob: 'x'.repeat(5000) })
        ).rejects.toThrow('oversized session cookie');
    });
});
