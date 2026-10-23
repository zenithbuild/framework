import { build } from '../dist/build.js';
import { createDevServer } from '../dist/dev-server.js';
import { createPreviewServer } from '../dist/preview.js';
import { jest } from '@jest/globals';
import { rm } from 'node:fs/promises';
import { makeProject, origin, fetchText, fetchJson, fetchBytes, cookieHeaderFromResponse } from './helpers/server-routing-fixtures.js';

jest.setTimeout(90000);

describe('Server routing resources', () => {
    let project = null;
    let dev = null;
    let preview = null;

    afterEach(async () => {
        if (dev) {
            dev.close();
            dev = null;
        }
        if (preview) {
            preview.close();
            preview = null;
        }
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('resource routes return json/text/downloads, preserve auth cookies, and accept multipart in dev and preview', async () => {
        const previousSecret = process.env.ZENITH_SESSION_SECRET;
        process.env.ZENITH_SESSION_SECRET = 'zenith-resource-test-secret';
        try {
            project = await makeProject({
                'api/ping.resource.ts': [
                    'export async function load(ctx) {',
                    '  return ctx.json({ method: ctx.method, route: ctx.route.pattern });',
                    '}'
                ].join('\n'),
                'api/health.resource.ts': [
                    'export async function load(ctx) {',
                    '  return ctx.text("healthy");',
                    '}'
                ].join('\n'),
                'api/login.resource.ts': [
                    'export async function action(ctx) {',
                    '  const form = await ctx.request.formData();',
                    '  const username = String(form.get("username") || "").trim();',
                    '  if (!username) return ctx.json({ error: "username_required" }, 422);',
                    '  await ctx.auth.signIn({ username });',
                    '  return ctx.json({ ok: true, username });',
                    '}'
                ].join('\n'),
                'api/me.resource.ts': [
                    'export async function guard(ctx) {',
                    '  await ctx.auth.requireSession({ deny: 401, message: "Login required" });',
                    '  return ctx.allow();',
                    '}',
                    'export async function load(ctx) {',
                    '  return ctx.json({ session: await ctx.auth.getSession() });',
                    '}'
                ].join('\n'),
                'api/logout.resource.ts': [
                    'export async function action(ctx) {',
                    '  await ctx.auth.signOut();',
                    '  return ctx.text("signed out");',
                    '}'
                ].join('\n'),
                'api/export.resource.ts': [
                    'export async function load(ctx) {',
                    '  return ctx.download("report,ok\\n", { filename: "report.csv", contentType: "text/csv; charset=utf-8" });',
                    '}'
                ].join('\n'),
                'api/login-download.resource.ts': [
                    'export async function action(ctx) {',
                    '  const form = await ctx.request.formData();',
                    '  const username = String(form.get("username") || "").trim();',
                    '  if (!username) return ctx.json({ error: "username_required" }, 422);',
                    '  await ctx.auth.signIn({ username });',
                    '  return ctx.download("signed-in:" + username, { filename: "session.txt", contentType: "text/plain; charset=utf-8" });',
                    '}'
                ].join('\n'),
                'api/protected-download.resource.ts': [
                    'export async function guard(ctx) {',
                    '  await ctx.auth.requireSession({ deny: 401, message: "Login required" });',
                    '  return ctx.allow();',
                    '}',
                    'export async function load(ctx) {',
                    '  const session = await ctx.auth.getSession();',
                    '  return ctx.download("hello:" + String(session.username || ""), { filename: "private.txt", contentType: "text/plain; charset=utf-8" });',
                    '}'
                ].join('\n'),
                'api/upload.resource.ts': [
                    'export async function action(ctx) {',
                    '  const form = await ctx.request.formData();',
                    '  const title = String(form.get("title") || "").trim();',
                    '  const attachment = form.get("attachment");',
                    '  if (!title) return ctx.json({ error: "title_required" }, 422);',
                    '  if (!(attachment instanceof File) || attachment.size === 0) return ctx.json({ error: "file_required" }, 422);',
                    '  return ctx.json({ title, fileName: attachment.name, fileSize: attachment.size });',
                    '}'
                ].join('\n'),
                'api/upload-download.resource.ts': [
                    'export async function action(ctx) {',
                    '  const form = await ctx.request.formData();',
                    '  const title = String(form.get("title") || "").trim();',
                    '  const attachment = form.get("attachment");',
                    '  if (!(attachment instanceof File) || attachment.size === 0) return ctx.text("missing file", 422);',
                    '  const encoder = new TextEncoder();',
                    '  return ctx.download(encoder.encode(title + ":" + attachment.name), { filename: "upload.txt", contentType: "text/plain; charset=utf-8" });',
                    '}'
                ].join('\n')
            });

            await build({ pagesDir: project.pagesDir, outDir: project.outDir });
            dev = await createDevServer({ pagesDir: project.pagesDir, outDir: project.outDir, port: 0 });
            preview = await createPreviewServer({ distDir: project.outDir, port: 0 });

            const devPing = await fetchJson(origin(dev.port), '/api/ping');
            const previewPing = await fetchJson(origin(preview.port), '/api/ping');
            expect(devPing.status).toBe(200);
            expect(devPing.body).toEqual({ method: 'GET', route: '/api/ping' });
            expect(previewPing.body).toEqual(devPing.body);

            const devHealth = await fetchText(origin(dev.port), '/api/health');
            const previewHealth = await fetchText(origin(preview.port), '/api/health');
            expect(devHealth.status).toBe(200);
            expect(previewHealth.status).toBe(200);
            expect(devHealth.body).toBe('healthy');
            expect(previewHealth.body).toBe('healthy');

            const devExport = await fetchBytes(origin(dev.port), '/api/export');
            const previewExport = await fetchBytes(origin(preview.port), '/api/export');
            expect(devExport.status).toBe(200);
            expect(previewExport.status).toBe(200);
            expect(devExport.headers.get('content-type')).toBe('text/csv; charset=utf-8');
            expect(previewExport.headers.get('content-type')).toBe('text/csv; charset=utf-8');
            expect(devExport.headers.get('content-disposition')).toContain('attachment;');
            expect(previewExport.headers.get('content-disposition')).toContain('attachment;');
            expect(devExport.body.toString('utf8')).toBe('report,ok\n');
            expect(previewExport.body.toString('utf8')).toBe('report,ok\n');

            const devHeadExport = await fetchText(origin(dev.port), '/api/export', { method: 'HEAD' });
            const previewHeadExport = await fetchText(origin(preview.port), '/api/export', { method: 'HEAD' });
            expect(devHeadExport.status).toBe(200);
            expect(previewHeadExport.status).toBe(200);
            expect(devHeadExport.body).toBe('');
            expect(previewHeadExport.body).toBe('');
            expect(devHeadExport.headers.get('content-disposition')).toContain('attachment;');
            expect(previewHeadExport.headers.get('content-disposition')).toContain('attachment;');

            const devUnauthorized = await fetchText(origin(dev.port), '/api/me');
            const previewUnauthorized = await fetchText(origin(preview.port), '/api/me');
            expect(devUnauthorized.status).toBe(401);
            expect(previewUnauthorized.status).toBe(401);
            expect(devUnauthorized.body).toBe('Login required');
            expect(previewUnauthorized.body).toBe('Login required');

            const devLogin = await fetchJson(origin(dev.port), '/api/login', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'username=zenith'
            });
            const previewLogin = await fetchJson(origin(preview.port), '/api/login', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'username=zenith'
            });
            expect(devLogin.status).toBe(200);
            expect(previewLogin.status).toBe(200);
            expect(devLogin.body).toEqual({ ok: true, username: 'zenith' });
            expect(previewLogin.body).toEqual(devLogin.body);

            const devCookie = cookieHeaderFromResponse(devLogin.headers);
            const previewCookie = cookieHeaderFromResponse(previewLogin.headers);
            expect(devCookie).toContain('zenith_session=');
            expect(previewCookie).toContain('zenith_session=');

            const devLoginDownload = await fetchBytes(origin(dev.port), '/api/login-download', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'username=zenith'
            });
            const previewLoginDownload = await fetchBytes(origin(preview.port), '/api/login-download', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'username=zenith'
            });
            expect(devLoginDownload.status).toBe(200);
            expect(previewLoginDownload.status).toBe(200);
            expect(devLoginDownload.body.toString('utf8')).toBe('signed-in:zenith');
            expect(previewLoginDownload.body.toString('utf8')).toBe('signed-in:zenith');
            expect(cookieHeaderFromResponse(devLoginDownload.headers)).toContain('zenith_session=');
            expect(cookieHeaderFromResponse(previewLoginDownload.headers)).toContain('zenith_session=');

            const devMe = await fetchJson(origin(dev.port), '/api/me', {
                headers: { Cookie: devCookie }
            });
            const previewMe = await fetchJson(origin(preview.port), '/api/me', {
                headers: { Cookie: previewCookie }
            });
            expect(devMe.status).toBe(200);
            expect(previewMe.status).toBe(200);
            expect(devMe.body).toEqual({ session: { username: 'zenith' } });
            expect(previewMe.body).toEqual(devMe.body);

            const devProtectedDownload = await fetchBytes(origin(dev.port), '/api/protected-download', {
                headers: { Cookie: devCookie }
            });
            const previewProtectedDownload = await fetchBytes(origin(preview.port), '/api/protected-download', {
                headers: { Cookie: previewCookie }
            });
            expect(devProtectedDownload.status).toBe(200);
            expect(previewProtectedDownload.status).toBe(200);
            expect(devProtectedDownload.body.toString('utf8')).toBe('hello:zenith');
            expect(previewProtectedDownload.body.toString('utf8')).toBe('hello:zenith');

            const uploadForm = new FormData();
            uploadForm.set('title', 'Resource upload');
            uploadForm.set('attachment', new File(['upload-body'], 'note.txt', { type: 'text/plain' }));

            const devUpload = await fetchJson(origin(dev.port), '/api/upload', {
                method: 'POST',
                body: uploadForm
            });
            const previewUpload = await fetchJson(origin(preview.port), '/api/upload', {
                method: 'POST',
                body: uploadForm
            });
            expect(devUpload.status).toBe(200);
            expect(previewUpload.status).toBe(200);
            expect(devUpload.body).toEqual({
                title: 'Resource upload',
                fileName: 'note.txt',
                fileSize: 11
            });
            expect(previewUpload.body).toEqual(devUpload.body);

            const uploadDownloadForm = new FormData();
            uploadDownloadForm.set('title', 'Resource download');
            uploadDownloadForm.set('attachment', new File(['download-body'], 'note.txt', { type: 'text/plain' }));

            const devUploadDownload = await fetchBytes(origin(dev.port), '/api/upload-download', {
                method: 'POST',
                body: uploadDownloadForm
            });
            const previewUploadDownload = await fetchBytes(origin(preview.port), '/api/upload-download', {
                method: 'POST',
                body: uploadDownloadForm
            });
            expect(devUploadDownload.status).toBe(200);
            expect(previewUploadDownload.status).toBe(200);
            expect(devUploadDownload.body.toString('utf8')).toBe('Resource download:note.txt');
            expect(previewUploadDownload.body.toString('utf8')).toBe('Resource download:note.txt');

            const devLogout = await fetchText(origin(dev.port), '/api/logout', {
                method: 'POST',
                headers: { Cookie: devCookie }
            });
            const previewLogout = await fetchText(origin(preview.port), '/api/logout', {
                method: 'POST',
                headers: { Cookie: previewCookie }
            });
            expect(devLogout.status).toBe(200);
            expect(previewLogout.status).toBe(200);
            expect(devLogout.body).toBe('signed out');
            expect(previewLogout.body).toBe('signed out');
            expect(cookieHeaderFromResponse(devLogout.headers)).toContain('zenith_session=');
            expect(cookieHeaderFromResponse(previewLogout.headers)).toContain('zenith_session=');
        } finally {
            if (previousSecret === undefined) {
                delete process.env.ZENITH_SESSION_SECRET;
            } else {
                process.env.ZENITH_SESSION_SECRET = previousSecret;
            }
        }
    });
});
