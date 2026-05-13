import { stream, sse, resolveRouteResult } from '../src/server-contract.js';
import { buildResourceResponseDescriptor } from '../src/resource-response.js';

function createRouteContext(method = 'GET') {
    return {
        params: {},
        url: new URL('http://localhost/api/stream'),
        headers: {},
        cookies: {},
        request: new Request('http://localhost/api/stream', { method }),
        method,
        route: { id: 'api/stream', pattern: '/api/stream', file: 'pages/api/stream.resource.ts' },
        env: {},
        action: null
    };
}

async function consumeStream(stream) {
    const reader = stream.getReader();
    const chunks = [];
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
    }
    return chunks;
}

describe('resource streaming & sse', () => {
    test('stream() accepts AsyncIterable and yields chunks', async () => {
        async function* generator() {
            yield 'chunk 1';
            yield 'chunk 2';
            yield 'chunk 3';
        }

        const result = stream(generator());
        const descriptor = buildResourceResponseDescriptor(result);

        expect(descriptor.status).toBe(200);
        expect(descriptor.headers['Content-Type']).toBe('application/octet-stream');
        
        const chunks = await consumeStream(descriptor.body);
        expect(chunks).toEqual(['chunk 1', 'chunk 2', 'chunk 3']);
    });

    test('stream() accepts ReadableStream directly', async () => {
        const readable = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('hello'));
                controller.close();
            }
        });

        const result = stream(readable, { contentType: 'text/plain' });
        const descriptor = buildResourceResponseDescriptor(result);

        expect(descriptor.headers['Content-Type']).toBe('text/plain');
        const chunks = await consumeStream(descriptor.body);
        expect(chunks).toEqual(['hello']);
    });

    test('sse() formats events correctly', async () => {
        async function* events() {
            yield { data: { hello: 'world' }, event: 'update' };
            yield { data: 'simple' };
            yield { data: 'multiline\ntext', id: '123' };
        }

        const result = sse(events());
        const descriptor = buildResourceResponseDescriptor(result);

        expect(descriptor.headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
        expect(descriptor.headers['Cache-Control']).toBe('no-cache');

        const chunks = await consumeStream(descriptor.body);
        expect(chunks.join('')).toBe(
            `event: update\ndata: {"hello":"world"}\n\n` +
            `data: simple\n\n` +
            `id: 123\ndata: multiline\ndata: text\n\n`
        );
    });

    test('sse() preserves safe metadata, retry zero, headers, and multiline data', async () => {
        async function* events() {
            yield {
                event: 'update',
                id: 'message-1',
                retry: 0,
                data: ['alpha', 'beta', 'gamma'].join('\r\n')
            };
        }

        const descriptor = buildResourceResponseDescriptor(sse(events()));

        expect(descriptor.headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
        expect(descriptor.headers['Cache-Control']).toBe('no-cache');
        expect(descriptor.headers.Connection).toBe('keep-alive');

        const chunks = await consumeStream(descriptor.body);
        expect(chunks.join('')).toBe(
            'event: update\n' +
            'id: message-1\n' +
            'retry: 0\n' +
            'data: alpha\n' +
            'data: beta\n' +
            'data: gamma\n\n'
        );
    });

    test('sse() rejects invalid event and id metadata while streaming', async () => {
        const lineBreak = String.fromCharCode(10);
        const control = String.fromCharCode(1);

        async function* invalidEvent() {
            yield { event: `bad${lineBreak}value`, data: 'ok' };
        }

        async function* invalidId() {
            yield { id: `bad${control}value`, data: 'ok' };
        }

        await expect(consumeStream(buildResourceResponseDescriptor(sse(invalidEvent())).body))
            .rejects.toThrow('sse event metadata must be a single line');
        await expect(consumeStream(buildResourceResponseDescriptor(sse(invalidId())).body))
            .rejects.toThrow('sse id metadata must be a single line');
    });

    test('sse() rejects invalid retry metadata while streaming', async () => {
        async function* numericStringRetry() {
            yield { retry: '1000', data: 'ok' };
        }

        async function* negativeRetry() {
            yield { retry: -1, data: 'ok' };
        }

        await expect(consumeStream(buildResourceResponseDescriptor(sse(numericStringRetry())).body))
            .rejects.toThrow('sse retry metadata must be a non-negative safe integer');
        await expect(consumeStream(buildResourceResponseDescriptor(sse(negativeRetry())).body))
            .rejects.toThrow('sse retry metadata must be a non-negative safe integer');
    });

    test('misuse of streaming in page route fails validation', async () => {
        const filePath = 'pages/example.zen';
        await expect(resolveRouteResult({
            exports: {
                load: async (ctx) => {
                    void ctx;
                    return stream((async function* () {})());
                }
            },
            ctx: createRouteContext('GET'),
            filePath
        })).rejects.toThrow(/kind "stream" is not allowed here/);

        await expect(resolveRouteResult({
            exports: {
                load: async (ctx) => {
                    void ctx;
                    return sse((async function* () {})());
                }
            },
            ctx: createRouteContext('GET'),
            filePath
        })).rejects.toThrow(/kind "sse" is not allowed here/);
    });

    test('stream() validation rejects non-iterables', async () => {
        await expect(resolveRouteResult({
            exports: {
                load: async (ctx) => {
                    void ctx;
                    return { kind: 'stream', body: {} }; // Manual malformed result
                }
            },
            ctx: createRouteContext('GET'),
            filePath: 'pages/api/stream.resource.ts',
            routeKind: 'resource'
        })).rejects.toThrow(/stream body must be a ReadableStream or AsyncIterable/);
    });
});
