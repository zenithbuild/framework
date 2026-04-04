import { appLocalRedirectLocation } from './base-path.js';
import { buildAttachmentContentDisposition, decodeDownloadResultBody } from './download-result.js';
import { clientFacingRouteMessage, defaultRouteDenyMessage } from './server-error.js';

function serializeJsonBody(payload) {
    return JSON.stringify(payload);
}

function createReadableStreamFromAsyncIterable(iterable) {
    const iterator = iterable[Symbol.asyncIterator]();
    return new ReadableStream({
        async pull(controller) {
            try {
                const { value, done } = await iterator.next();
                if (done) {
                    controller.close();
                } else {
                    controller.enqueue(typeof value === 'string' ? new TextEncoder().encode(value) : value);
                }
            } catch (err) {
                controller.error(err);
            }
        },
        async cancel() {
            if (typeof iterator.return === 'function') {
                await iterator.return();
            }
        }
    });
}

function createSseStream(events) {
    const iterator = events[Symbol.asyncIterator]();
    const encoder = new TextEncoder();

    return new ReadableStream({
        async pull(controller) {
            try {
                const { value, done } = await iterator.next();
                if (done) {
                    controller.close();
                    return;
                }

                let chunk = '';
                if (value.event) chunk += `event: ${value.event}\n`;
                if (value.id) chunk += `id: ${value.id}\n`;
                if (value.retry) chunk += `retry: ${value.retry}\n`;

                const data = typeof value.data === 'string' ? value.data : JSON.stringify(value.data);
                const lines = data.split('\n');
                for (const line of lines) {
                    chunk += `data: ${line}\n`;
                }
                chunk += '\n';

                controller.enqueue(encoder.encode(chunk));
            } catch (err) {
                controller.error(err);
            }
        },
        async cancel() {
            if (typeof iterator.return === 'function') {
                await iterator.return();
            }
        }
    });
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

    if (result.kind === 'json' || result.kind === 'invalid') {
        const status = Number.isInteger(result.status) ? result.status : (result.kind === 'invalid' ? 400 : 200);
        return {
            status,
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

    if (result.kind === 'stream') {
        const body = typeof result.body?.getReader === 'function'
            ? result.body
            : createReadableStreamFromAsyncIterable(result.body);
        return {
            status: Number.isInteger(result.status) ? result.status : 200,
            headers: {
                'Content-Type': result.contentType || 'application/octet-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            },
            body,
            setCookies
        };
    }

    if (result.kind === 'sse') {
        return {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            },
            body: createSseStream(result.events),
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
