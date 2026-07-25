/**
 * Vercel Build Output API adapter for Zenith.
 *
 * Transforms site/dist/ into .vercel/output/ with:
 *   - Static assets served from .vercel/output/static/
 *   - A Vercel Function at .vercel/output/functions/zenith-handler.func/
 *     that reuses Zenith's existing route rendering logic
 *   - Routing configuration in .vercel/output/config.json
 *
 * Usage: node scripts/vercel-adapter.mjs [--site-dir <path>] [--output-dir <path>]
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readdir, readFile, stat, rm } from 'node:fs/promises';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function getArg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const siteDir = resolve(getArg('--site-dir', join(__dirname, '..')));
const outputDir = resolve(getArg('--output-dir', join(siteDir, '..', '.vercel', 'output')));
const distDir = join(siteDir, 'dist');
const staticSrcDir = join(distDir, 'static');
const funcDir = join(outputDir, 'functions', 'zenith-handler.func');
const staticOutDir = join(outputDir, 'static');
const siteNodeModules = join(siteDir, 'node_modules');

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function copyFile(src, dest) {
  await mkdir(dirname(dest), { recursive: true });
  await pipeline(createReadStream(src), createWriteStream(dest));
}

async function copyDir(src, dest, filter) {
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      const ok = filter ? filter(entry.name, srcPath, true) : true;
      if (ok) await copyDir(srcPath, destPath, filter);
    } else if (entry.isFile()) {
      const ok = filter ? filter(entry.name, srcPath, false) : true;
      if (ok) await copyFile(srcPath, destPath);
    }
  }
}

/**
 * Copy npm packages and their transitive dependencies into the function's node_modules/.
 * Uses package.json "dependencies" to resolve the tree.
 */
async function copyNodeModules(destNodeModules) {
  console.log('[adapter] Copying required node_modules...');
  const visited = new Set();
  // Root packages needed by server route modules
  const queue = ['gray-matter', 'marked', 'sanitize-html', 'tailwind-merge'];

  while (queue.length > 0) {
    const pkg = queue.shift();
    if (visited.has(pkg)) continue;
    visited.add(pkg);

    // Handle scoped packages
    const pkgPath = pkg.startsWith('@')
      ? join(siteNodeModules, pkg)
      : join(siteNodeModules, pkg);

    if (!(await exists(pkgPath))) continue;

    // Copy the package
    const destPkgPath = join(destNodeModules, pkg);
    await copyDir(pkgPath, destPkgPath, (name) => name !== '.DS_Store');

    // Read dependencies from package.json
    try {
      const pkgJson = JSON.parse(await readFile(join(pkgPath, 'package.json'), 'utf8'));
      const deps = pkgJson.dependencies || {};
      for (const dep of Object.keys(deps)) {
        if (!visited.has(dep)) queue.push(dep);
      }
    } catch { /* package.json may not exist or be readable */ }
  }

  // Copy @zenithbuild/* packages (needed by server runtime)
  const zenithDir = join(siteNodeModules, '@zenithbuild');
  if (await exists(zenithDir)) {
    const destZenithDir = join(destNodeModules, '@zenithbuild');
    await mkdir(destZenithDir, { recursive: true });
    await copyDir(zenithDir, destZenithDir, (name) => name !== '.DS_Store');
    console.log('[adapter]   copied @zenithbuild/*');
  }

  console.log(`[adapter]   copied ${visited.size} packages + @zenithbuild/*`);
}

async function buildStaticOutput() {
  console.log('[adapter] Copying static assets to output/static/...');
  await mkdir(staticOutDir, { recursive: true });

  const manifest = JSON.parse(await readFile(join(distDir, 'manifest.json'), 'utf8'));
  const pageHtmlPaths = new Set();
  for (const route of manifest.routes || []) {
    if (route.html) pageHtmlPaths.add(route.html);
  }

  await copyDir(staticSrcDir, staticOutDir, (name, srcPath, isDir) => {
    if (isDir) return true;
    const relPath = relative(staticSrcDir, srcPath);
    const normalized = '/' + relPath.split(sep).join('/');
    if (pageHtmlPaths.has(normalized)) {
      console.log(`[adapter]   skip page HTML: ${normalized}`);
      return false;
    }
    if (name === '.DS_Store') return false;
    return true;
  });
  console.log('[adapter] Static output complete.');
}

async function buildFunction() {
  console.log('[adapter] Building Vercel Function bundle...');
  await mkdir(funcDir, { recursive: true });

  // Copy handler entry point
  await copyFile(join(siteDir, 'scripts', 'vercel-handler.mjs'), join(funcDir, 'index.js'));

  // package.json for ESM
  await mkdir(funcDir, { recursive: true });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(funcDir, 'package.json'), JSON.stringify({
    name: 'zenith-handler', type: 'module', private: true,
  }, null, 2));

  // Copy dist/ into function
  console.log('[adapter]   copying dist/...');
  await copyDir(distDir, join(funcDir, 'dist'));

  // Copy required node_modules
  await copyNodeModules(join(funcDir, 'node_modules'));

  // Calculate bundle size
  let totalSize = 0;
  async function calcSize(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) await calcSize(p);
      else totalSize += (await stat(p)).size;
    }
  }
  await calcSize(funcDir);
  console.log(`[adapter] Function bundle: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);

  // .vc-config.json
  await writeFile(join(funcDir, '.vc-config.json'), JSON.stringify({
    runtime: 'nodejs22.x', handler: 'index.js', launcherType: 'nodejs', shouldAddHelpers: true,
  }));

  console.log('[adapter] Function bundle complete.');
}

async function buildConfig() {
  console.log('[adapter] Writing output/config.json...');
  const { writeFile } = await import('node:fs/promises');
  const config = {
    version: 3,
    routes: [
      { src: '/assets/(.*)', headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/zenith-handler' },
    ],
  };
  await writeFile(join(outputDir, 'config.json'), JSON.stringify(config, null, 2));
  console.log('[adapter] Config written.');
}

async function main() {
  console.log('[adapter] Vercel Build Output API adapter');
  console.log(`[adapter]   siteDir:   ${siteDir}`);
  console.log(`[adapter]   outputDir: ${outputDir}`);

  if (!(await exists(distDir))) throw new Error(`[adapter] dist/ not found at ${distDir}.`);
  if (!(await exists(join(distDir, 'manifest.json')))) throw new Error('[adapter] dist/manifest.json not found.');
  if (!(await exists(join(distDir, 'server', 'manifest.json')))) throw new Error('[adapter] dist/server/manifest.json not found.');

  if (await exists(outputDir)) {
    console.log('[adapter] Cleaning previous output...');
    await rm(outputDir, { recursive: true, force: true });
  }
  await mkdir(outputDir, { recursive: true });

  await buildStaticOutput();
  await buildFunction();
  await buildConfig();

  console.log('[adapter] ✅ Vercel output ready at', outputDir);
}

main().catch((err) => {
  console.error('[adapter] ❌ Failed:', err.message);
  process.exit(1);
});
