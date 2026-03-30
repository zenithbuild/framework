import { appLocalRedirectLocation } from './base-path.js';
import { buildAttachmentContentDisposition, decodeDownloadResultBody } from './download-result.js';
import { clientFacingRouteMessage, defaultRouteDenyMessage } from './server-error.js';

function serializeJsonBody(payload) {
    return JSON.stringify(payload);
}

export function buildResourceResponseDescriptor(result, basePath = '/', setCookies = []) {
    if (!result || typeof result !== 'object') {
        return {
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: defaultRouteDenyMessage(500),
            setCookies
        };
    }

    if (result.kind === 'redirect') {
        return {
            status: Number.isInteger(result.status) ? result.status : 302,
            headers: {
                Location: appLocalRedirectLocation(result.location, basePath),
                'Cache-Control': 'no-store'
            },
            body: '',
            setCookies
        };
    }

    if (result.kind === 'deny') {
        const status = Number.isInteger(result.status) ? result.status : 403;
        return {
            status,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: clientFacingRouteMessage(status, result.message),
            setCookies
        };
    }

    if (result.kind === 'json') {
        return {
            status: Number.isInteger(result.status) ? result.status : 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: serializeJsonBody(result.data),
            setCookies
        };
    }

    if (result.kind === 'text') {
        return {
            status: Number.isInteger(result.status) ? result.status : 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: result.body,
            setCookies
        };
    }

    if (result.kind === 'download') {
        const body = decodeDownloadResultBody(result, 'resource download response');
        return {
            status: 200,
            headers: {
                'Content-Type': result.contentType,
                'Content-Disposition': buildAttachmentContentDisposition(result.filename),
                'Content-Length': String(body.byteLength)
            },
            body,
            setCookies
        };
    }

    return {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: defaultRouteDenyMessage(500),
        setCookies
    };
}
