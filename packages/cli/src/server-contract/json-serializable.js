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
                for (let i = 0; i < v.length; i += 1) {
                    walk(v[i], `${path}[${i}]`);
                }
                return;
            }

            const proto = Object.getPrototypeOf(v);
            const isPlainObject = proto === null ||
                proto === Object.prototype ||
                (proto && proto.constructor && proto.constructor.name === 'Object');

            if (!isPlainObject) {
                throw new Error(`[Zenith] ${where}: non-plain object at ${path}`);
            }

            for (const key of Object.keys(v)) {
                if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                    throw new Error(`[Zenith] ${where}: forbidden prototype pollution key "${key}" at ${path}.${key}`);
                }
                walk(v[key], `${path}.${key}`);
            }
            return;
        }

        throw new Error(`[Zenith] ${where}: unsupported type at ${path}`);
    }

    walk(value, '$');
}
