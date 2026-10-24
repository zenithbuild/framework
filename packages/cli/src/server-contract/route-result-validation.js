import { assertValidDownloadResult } from '../download-result.js';
import { ROUTE_RESULT_KINDS } from './constants.js';

export function isRouteResultLike(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const kind = value.kind;
    return typeof kind === 'string' && ROUTE_RESULT_KINDS.has(kind);
}

export function assertValidRouteResultShape(value, where, allowedKinds) {
    if (!isRouteResultLike(value)) {
        throw new Error(`[Zenith] ${where}: invalid route result. Expected object with kind.`);
    }
    const kind = value.kind;
    if (!allowedKinds.has(kind)) {
        throw new Error(
            `[Zenith] ${where}: kind "${kind}" is not allowed here (allowed: ${Array.from(allowedKinds).join(', ')}).`
        );
    }

    if (kind === 'redirect') {
        if (typeof value.location !== 'string' || value.location.length === 0) {
            throw new Error(`[Zenith] ${where}: redirect requires non-empty string location.`);
        }
        if (value.status !== undefined && (!Number.isInteger(value.status) || value.status < 300 || value.status > 399)) {
            throw new Error(`[Zenith] ${where}: redirect status must be an integer 3xx.`);
        }
    }

    if (kind === 'deny') {
        if (
            !Number.isInteger(value.status) ||
            (value.status !== 401 && value.status !== 403 && value.status !== 404)
        ) {
            throw new Error(`[Zenith] ${where}: deny status must be 401, 403, or 404.`);
        }
        if (value.message !== undefined && typeof value.message !== 'string') {
            throw new Error(`[Zenith] ${where}: deny message must be a string when provided.`);
        }
    }

    if (kind === 'invalid') {
        if (!Number.isInteger(value.status) || (value.status !== 400 && value.status !== 422)) {
            throw new Error(`[Zenith] ${where}: invalid status must be 400 or 422.`);
        }
    }

    if (kind === 'json' || kind === 'text') {
        if (!Number.isInteger(value.status) || value.status < 200 || value.status > 599 || (value.status >= 300 && value.status <= 399)) {
            throw new Error(`[Zenith] ${where}: ${kind} status must be an integer between 200-599 and may not be 3xx.`);
        }
        if (kind === 'text' && typeof value.body !== 'string') {
            throw new Error(`[Zenith] ${where}: text body must be a string.`);
        }
    }

    if (kind === 'download') {
        assertValidDownloadResult(value, where);
    }

    if (kind === 'stream') {
        if (!isReadableStream(value.body) && !isAsyncIterable(value.body)) {
            throw new Error(`[Zenith] ${where}: stream body must be a ReadableStream or AsyncIterable.`);
        }
        if (value.status !== undefined && (!Number.isInteger(value.status) || value.status < 200 || value.status > 599 || (value.status >= 300 && value.status <= 399))) {
            throw new Error(`[Zenith] ${where}: stream status must be an integer between 200-599 and may not be 3xx.`);
        }
        if (value.contentType !== undefined && typeof value.contentType !== 'string') {
            throw new Error(`[Zenith] ${where}: stream contentType must be a string.`);
        }
    }

    if (kind === 'sse') {
        if (!isAsyncIterable(value.events)) {
            throw new Error(`[Zenith] ${where}: sse events must be an AsyncIterable.`);
        }
    }
}

function isReadableStream(v) {
    return v && typeof v === 'object' && typeof v.getReader === 'function' && typeof v.cancel === 'function';
}

function isAsyncIterable(v) {
    return v && typeof v === 'object' && typeof v[Symbol.asyncIterator] === 'function';
}
