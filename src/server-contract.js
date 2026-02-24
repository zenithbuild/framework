// server-contract.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// Shared validation and payload resolution logic for <script server> blocks.

const NEW_KEYS = new Set(['data', 'load', 'prerender']);
const LEGACY_KEYS = new Set(['ssr_data', 'props', 'ssr', 'prerender']);
const ALLOWED_KEYS = new Set(['data', 'load', 'prerender', 'ssr_data', 'props', 'ssr']);

export function validateServerExports({ exports, filePath }) {
    const exportKeys = Object.keys(exports);
    const illegalKeys = exportKeys.filter(k => !ALLOWED_KEYS.has(k));

    if (illegalKeys.length > 0) {
        throw new Error(`[Zenith] ${filePath}: illegal export(s): ${illegalKeys.join(', ')}`);
    }

    const hasData = 'data' in exports;
    const hasLoad = 'load' in exports;

    const hasNew = hasData || hasLoad;
    const hasLegacy = ('ssr_data' in exports) || ('props' in exports) || ('ssr' in exports);

    if (hasData && hasLoad) {
        throw new Error(`[Zenith] ${filePath}: cannot export both "data" and "load". Choose one.`);
    }

    if (hasNew && hasLegacy) {
        throw new Error(
            `[Zenith] ${filePath}: cannot mix new ("data"/"load") with legacy ("ssr_data"/"props"/"ssr") exports.`
        );
    }

    if ('prerender' in exports && typeof exports.prerender !== 'boolean') {
        throw new Error(`[Zenith] ${filePath}: "prerender" must be a boolean.`);
    }

    if (hasLoad && typeof exports.load !== 'function') {
        throw new Error(`[Zenith] ${filePath}: "load" must be a function.`);
    }
    if (hasLoad) {
        if (exports.load.length !== 1) {
            throw new Error(`[Zenith] ${filePath}: "load(ctx)" must take exactly 1 argument.`);
        }
        const fnStr = exports.load.toString();
        const paramsMatch = fnStr.match(/^[^{=]+\(([^)]*)\)/);
        if (paramsMatch && paramsMatch[1].includes('...')) {
            throw new Error(`[Zenith] ${filePath}: "load(ctx)" must not contain rest parameters.`);
        }
    }
}

export function assertJsonSerializable(value, where = 'payload') {
    const seen = new Set();

    function walk(v, path) {
        const t = typeof v;

        if (v === null) return;
        if (t === 'string' || t === 'number' || t === 'boolean') return;

        if (t === 'bigint' || t === 'function' || t === 'symbol') {
            throw new Error(`[Zenith] ${where}: non-serializable ${t} at ${path}`);
        }

        if (t === 'undefined') {
            throw new Error(`[Zenith] ${where}: undefined is not allowed at ${path}`);
        }

        if (v instanceof Date) {
            throw new Error(`[Zenith] ${where}: Date is not allowed at ${path} (convert to ISO string)`);
        }

        if (v instanceof Map || v instanceof Set) {
            throw new Error(`[Zenith] ${where}: Map/Set not allowed at ${path}`);
        }

        if (t === 'object') {
            if (seen.has(v)) throw new Error(`[Zenith] ${where}: circular reference at ${path}`);
            seen.add(v);

            if (Array.isArray(v)) {
                if (path === '$') {
                    throw new Error(`[Zenith] ${where}: top-level payload must be a plain object, not an array at ${path}`);
                }
                for (let i = 0; i < v.length; i++) walk(v[i], `${path}[${i}]`);
                return;
            }

            const proto = Object.getPrototypeOf(v);
            const isPlainObject = proto === null ||
                proto === Object.prototype ||
                (proto && proto.constructor && proto.constructor.name === 'Object');

            if (!isPlainObject) {
                throw new Error(`[Zenith] ${where}: non-plain object at ${path}`);
            }

            for (const k of Object.keys(v)) {
                if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
                    throw new Error(`[Zenith] ${where}: forbidden prototype pollution key "${k}" at ${path}.${k}`);
                }
                walk(v[k], `${path}.${k}`);
            }
            return;
        }

        throw new Error(`[Zenith] ${where}: unsupported type at ${path}`);
    }

    walk(value, '$');
}

export async function resolveServerPayload({ exports, ctx, filePath }) {
    validateServerExports({ exports, filePath });

    let payload;
    if ('load' in exports) {
        payload = await exports.load(ctx);
        assertJsonSerializable(payload, `${filePath}: load(ctx) return`);
        return payload;
    }
    if ('data' in exports) {
        payload = exports.data;
        assertJsonSerializable(payload, `${filePath}: data export`);
        return payload;
    }

    // legacy fallback
    if ('ssr_data' in exports) {
        payload = exports.ssr_data;
        assertJsonSerializable(payload, `${filePath}: ssr_data export`);
        return payload;
    }
    if ('props' in exports) {
        payload = exports.props;
        assertJsonSerializable(payload, `${filePath}: props export`);
        return payload;
    }
    if ('ssr' in exports) {
        payload = exports.ssr;
        assertJsonSerializable(payload, `${filePath}: ssr export`);
        return payload;
    }

    return {};
}
