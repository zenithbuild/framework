import { createDownloadResult } from '../download-result.js';

export function allow() {
    return { kind: 'allow' };
}

export function redirect(location, status = 302) {
    return {
        kind: 'redirect',
        location: String(location || ''),
        status: Number.isInteger(status) ? status : 302
    };
}

export function deny(status = 403, message = undefined) {
    return {
        kind: 'deny',
        status: Number.isInteger(status) ? status : 403,
        message: typeof message === 'string' ? message : undefined
    };
}

export function data(payload) {
    return { kind: 'data', data: payload };
}

export function invalid(payload, status = 400) {
    return {
        kind: 'invalid',
        data: payload,
        status: Number.isInteger(status) ? status : 400
    };
}

export function json(payload, status = 200) {
    return {
        kind: 'json',
        data: payload,
        status: Number.isInteger(status) ? status : 200
    };
}

export function text(body, status = 200) {
    return {
        kind: 'text',
        body: typeof body === 'string' ? body : String(body ?? ''),
        status: Number.isInteger(status) ? status : 200
    };
}

export function download(body, options = {}) {
    return createDownloadResult(body, options);
}

export function stream(body, options = {}) {
    return {
        kind: 'stream',
        body,
        status: options?.status,
        contentType: options?.contentType
    };
}

export function sse(events) {
    return {
        kind: 'sse',
        events
    };
}
