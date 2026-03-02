// PHASE 4.6 — Static serve parity + substrate certification.
// Contract focus:
// - Build output is deterministic, sealed, and runtime-pure.
// - Dist works on a dumb static server with no dev-server compensation.
// - Router identity is sensitive to manifest changes.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess, getFreePort, startProcess, waitForHttp } from './helpers/process.js';
import { walkFilesDeterministic } from './helpers/fs.js';
import { repoRoot } from './helpers/paths.js';

jest.setTimeout(240000);

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html';
    case '.js':
      return 'application/javascript';
    case '.css':
      return 'text/css';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

async function startDumbStaticServer(distDir, port) {
  const root = path.resolve(distDir);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const pathname = decodeURIComponent(url.pathname);

      const candidates = [];
      if (pathname.endsWith('/')) {
        candidates.push(`${pathname}index.html`);
      } else {
        candidates.push(pathname);
        candidates.push(`${pathname}/index.html`);
        candidates.push(`${pathname}.html`);
      }

      for (const candidate of candidates) {
        const relative = candidate.replace(/^\/+/, '');
        const absolute = path.resolve(root, relative);
        if (!(absolute === root || absolute.startsWith(`${root}${path.sep}`))) {
          continue;
        }

        try {
          const fileStat = await fs.stat(absolute);
          if (!fileStat.isFile()) {
            continue;
          }
          const body = await fs.readFile(absolute);
          res.writeHead(200, { 'Content-Type': contentTypeFor(absolute) });
          res.end(body);
          return;
        } catch {
          // Try next candidate.
        }
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  return {
    async close() {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

async function readBuildSnapshot(root) {
  const distDir = path.join(root, 'dist');
  const manifestPath = path.join(distDir, 'manifest.json');
  const manifestRaw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  const manifestHash = sha256Hex(manifestRaw);

  const routerRel = manifest.router;
  expect(typeof routerRel).toBe('string');
  expect(/^\/assets\/router\.[a-f0-9]{8}\.js$/.test(routerRel)).toBe(true);

  const routerFile = path.join(distDir, routerRel.replace(/^\//, ''));
  const routerSource = await fs.readFile(routerFile, 'utf8');
  const firstLineEnd = routerSource.indexOf('\n');
  expect(firstLineEnd).toBeGreaterThan(0);

  const firstLine = routerSource.slice(0, firstLineEnd).trim();
  const embeddedManifestMatch = firstLine.match(/^window\.__ZENITH_MANIFEST__ = (.+);$/);
  expect(embeddedManifestMatch).not.toBeNull();
  const embeddedManifestJson = embeddedManifestMatch[1];
  const runtimeSource = routerSource.slice(firstLineEnd + 1);

  const routerName = path.basename(routerFile);
  const routerHashMatch = routerName.match(/^router\.([a-f0-9]{8})\.js$/);
  expect(routerHashMatch).not.toBeNull();
  const routerHash = routerHashMatch[1];
  const expectedRouterHash = sha256Hex(`${runtimeSource}${embeddedManifestJson}`).slice(0, 8);

  return {
    distDir,
    manifest,
    manifestRaw,
    manifestHash,
    routerRel,
    routerSource,
    routerHash,
    expectedRouterHash
  };
}

describe('Phase 4.6: static serve parity & substrate certification', () => {
  test('certifies sealed static parity for router mode', async () => {
    const root = await createTempProject('zenith-phase46-static-parity');
    const browser = await chromium.launch({ headless: true });
    let dumbServer = null;
    let dev = null;

    try {
      await scaffoldZenithProject(root, {
        router: true,
        pages: {
          'index.zen': '<script>const title = "Home";</script><main><style>main{display:block;}</style><h1 id="title">{title}</h1><nav><a id="home-link" href="/">Home</a><a id="about-link" href="/about">About</a><a id="blog-link" href="/blog">Blog</a></nav></main>',
          'about.zen': '<script>const title = "About";</script><main><style>main{display:block;}</style><h1 id="title">{title}</h1><nav><a id="home-link" href="/">Home</a><a id="about-link" href="/about">About</a><a id="blog-link" href="/blog">Blog</a></nav></main>',
          'blog.zen': '<script>const title = "Blog";</script><main><style>main{display:block;}</style><h1 id="title">{title}</h1><nav><a id="home-link" href="/">Home</a><a id="about-link" href="/about">About</a><a id="blog-link" href="/blog">Blog</a></nav></main>'
        }
      });

      assertSuccess(npmInstall(root), 'npm install');
      assertSuccess(runCli(root, ['build']), 'zenith build (pass 1)');

      const snapshot1 = await readBuildSnapshot(root);
      const files1 = await walkFilesDeterministic(snapshot1.distDir);
      const htmlFiles = files1.filter((file) => file.endsWith('.html'));
      expect(htmlFiles.length).toBe(3);

      // Build output integrity checks.
      for (const rel of htmlFiles) {
        const source = await fs.readFile(path.join(snapshot1.distDir, rel), 'utf8');
        expect(countMatches(source, /<link\b[^>]*rel=["']stylesheet["'][^>]*>/g)).toBe(1);
        expect(countMatches(source, /<script\b[^>]*type=["']module["'][^>]*>/g)).toBe(1);
      }

      for (const rel of files1) {
        const source = await fs.readFile(path.join(snapshot1.distDir, rel), 'utf8');
        expect(source.includes('.zen')).toBe(false);
        expect(source.includes('fetch(')).toBe(false);
      }

      expect(snapshot1.routerSource.includes('import(__ZENITH_MANIFEST__.chunks[route])')).toBe(true);
      expect(snapshot1.routerSource.includes('fetch(')).toBe(false);
      expect(snapshot1.routerSource.includes('router-manifest.json')).toBe(false);

      // CSS verification.
      expect(typeof snapshot1.manifest.css).toBe('string');
      expect(/^\/assets\/styles\.[a-f0-9]{8}\.css$/.test(snapshot1.manifest.css)).toBe(true);
      const cssPath = path.join(snapshot1.distDir, snapshot1.manifest.css.replace(/^\//, ''));
      const cssSource = await fs.readFile(cssPath, 'utf8');
      expect(cssSource.trim().length).toBeGreaterThan(0);

      for (const rel of htmlFiles) {
        const source = await fs.readFile(path.join(snapshot1.distDir, rel), 'utf8');
        expect(source.includes(`href="${snapshot1.manifest.css}"`)).toBe(true);
      }

      // Router identity hash contract.
      expect(snapshot1.routerHash).toBe(snapshot1.expectedRouterHash);

      // Static server parity check (no zenith dev / no preview rewrite).
      const port = await getFreePort();
      dumbServer = await startDumbStaticServer(snapshot1.distDir, port);

      // Byte parity: zenith dev must serve the same built HTML bytes.
      const devPort = await getFreePort();
      dev = startProcess('npm', ['run', 'dev', '--silent', '--', String(devPort)], { cwd: root });
      await waitForHttp(`http://localhost:${devPort}/`, { expectStatuses: [200], timeoutMs: 45000 });

      for (const route of ['/', '/about', '/blog']) {
        const [staticRes, devRes] = await Promise.all([
          fetch(`http://127.0.0.1:${port}${route}`),
          fetch(`http://localhost:${devPort}${route}`, {
            headers: { accept: 'text/html' }
          })
        ]);
        expect(devRes.status).toBe(staticRes.status);
        const [staticBody, devBody] = await Promise.all([staticRes.text(), devRes.text()]);
        expect(devBody).toBe(staticBody);
      }

      const page = await browser.newPage();

      const requestFailures = [];
      const badResponses = [];
      const consoleErrors = [];
      const requestUrls = [];

      page.on('requestfailed', (request) => {
        requestFailures.push({
          url: request.url(),
          error: request.failure() ? request.failure().errorText : 'unknown'
        });
      });
      page.on('response', (response) => {
        if (response.status() >= 400) {
          badResponses.push({ url: response.url(), status: response.status() });
        }
      });
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      page.on('request', (request) => {
        requestUrls.push(request.url());
      });

      const base = `http://127.0.0.1:${port}`;
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });
      expect(await page.textContent('#title')).toContain('Home');
      expect(
        await page.evaluate(() => typeof window.__ZENITH_MANIFEST__ === 'object' && window.__ZENITH_MANIFEST__ !== null)
      ).toBe(true);

      await page.click('#about-link');
      await page.waitForURL(`${base}/about`, { timeout: 5000 });
      await page.waitForFunction(
        () => (document.querySelector('#title')?.textContent || '').includes('About'),
        { timeout: 5000 }
      );
      expect(await page.textContent('#title')).toContain('About');

      await page.click('#blog-link');
      await page.waitForURL(`${base}/blog`, { timeout: 5000 });
      await page.waitForFunction(
        () => (document.querySelector('#title')?.textContent || '').includes('Blog'),
        { timeout: 5000 }
      );
      expect(await page.textContent('#title')).toContain('Blog');

      expect(requestFailures).toEqual([]);
      expect(badResponses).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(requestUrls.some((url) => url.includes('router-manifest.json'))).toBe(false);

      await page.close();
      await dumbServer.close();
      dumbServer = null;

      // Router identity sensitivity: page edit must change page chunk + manifest + router hash.
      const aboutPage = path.join(root, 'pages', 'about.zen');
      const aboutSource = await fs.readFile(aboutPage, 'utf8');
      const aboutMutated = aboutSource.replace('const title = "About";', 'const title = "About v2";');
      expect(aboutMutated).not.toBe(aboutSource);
      await fs.writeFile(aboutPage, aboutMutated, 'utf8');

      assertSuccess(runCli(root, ['build']), 'zenith build (pass 2)');
      const snapshot2 = await readBuildSnapshot(root);
      expect(snapshot2.routerHash).toBe(snapshot2.expectedRouterHash);

      expect(snapshot2.manifest.chunks['/about']).not.toBe(snapshot1.manifest.chunks['/about']);
      expect(snapshot2.manifestHash).not.toBe(snapshot1.manifestHash);
      expect(snapshot2.routerRel).not.toBe(snapshot1.routerRel);

      // Dev server purity checks (no mutation/stubbing/HMR/patching logic).
      const devServerPath = path.join(repoRoot, 'packages', 'cli', 'src', 'dev-server.js');
      const devServerSource = await fs.readFile(devServerPath, 'utf8');
      expect(devServerSource.includes('__zenith_hmr')).toBe(false);
      expect(devServerSource.includes('router-manifest.json')).toBe(false);
      expect(devServerSource.includes('text/event-stream')).toBe(false);
      expect(devServerSource.includes('WebSocket')).toBe(false);
      expect(devServerSource.includes('data-zx-router')).toBe(false);
      expect(devServerSource.includes('data-zx-page')).toBe(false);
      expect(devServerSource.includes('<script')).toBe(false);
      expect(devServerSource.includes('<link')).toBe(false);
    } finally {
      if (dev) {
        await dev.stop();
      }
      if (dumbServer) {
        await dumbServer.close();
      }
      await browser.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
