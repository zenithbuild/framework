import { validateHostedResourceRoutes } from '../dist/adapters/validate-hosted-resource-routes.js';

describe('hosted resource route validation helper', () => {
    test('rejects resource routes that call ctx.download', () => {
        expect(() => validateHostedResourceRoutes([
            {
                route_kind: 'resource',
                path: '/api/export',
                file: 'pages/api/export.resource.ts',
                server_script: 'export function load(ctx) { return ctx.download("ok", { filename: "ok.txt" }); }'
            }
        ], 'vercel')).toThrow(
            '[Zenith:Build] target "vercel" does not support resource downloads in this milestone. ' +
            'Route "/api/export" (pages/api/export.resource.ts) must run on dev, preview, or target "node".'
        );
    });

    test('rejects resource routes that call bare download helper', () => {
        expect(() => validateHostedResourceRoutes([
            {
                route_kind: 'resource',
                path: '/api/report',
                file: 'pages/api/report.resource.ts',
                server_script: 'import { download } from "zenith:server-contract"; export const load = () => download("ok");'
            }
        ], 'netlify')).toThrow('target "netlify" does not support resource downloads in this milestone');
    });

    test('ignores page routes and resource routes without download calls', () => {
        expect(() => validateHostedResourceRoutes([
            {
                route_kind: 'page',
                path: '/download',
                file: 'pages/download.zen',
                server_script: 'export const load = () => ctx.download("page-only");'
            },
            {
                route_kind: 'resource',
                path: '/api/health',
                file: 'pages/api/health.resource.ts',
                server_script: 'export const load = (ctx) => ctx.text("ok");'
            },
            {
                route_kind: 'resource',
                path: '/api/generated',
                file: 'pages/api/generated.resource.ts',
                server_script: null
            }
        ], 'vercel')).not.toThrow();
    });

    test('ignores malformed manifests without changing validation ownership', () => {
        expect(() => validateHostedResourceRoutes(null, 'vercel')).not.toThrow();
        expect(() => validateHostedResourceRoutes({ routes: [] }, 'netlify')).not.toThrow();
    });
});
