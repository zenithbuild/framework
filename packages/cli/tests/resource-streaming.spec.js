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
