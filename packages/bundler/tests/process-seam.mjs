import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const compilerBin = path.resolve(repoRoot, '../zenith-compiler/target/release/zenith-compiler');
const bundlerBin = path.resolve(repoRoot, 'target/release/zenith-bundler');

function listTree(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      out.push(`${rel}/`);
      out.push(...listTree(full, rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

if (!fs.existsSync(compilerBin)) {
  throw new Error(`compiler binary missing at ${compilerBin}. Build it first.`);
}
if (!fs.existsSync(bundlerBin)) {
  throw new Error(`bundler binary missing at ${bundlerBin}. Build it first.`);
}

const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zenith-bundler-seam-'));
const fixturePath = path.join(sandboxRoot, 'fixture.zen');
const outDir = path.join(sandboxRoot, 'dist-test');

fs.writeFileSync(fixturePath, '<main><h1>{title}</h1></main>\n', 'utf8');

const compileResult = spawnSync(compilerBin, [fixturePath], {
  encoding: 'utf8'
});

console.log('COMPILER BIN:', compilerBin);
console.log('COMPILER EXIT:', compileResult.status);
console.log('COMPILER STDERR:', compileResult.stderr.trim() || '<empty>');

assert.equal(compileResult.status, 0, 'compiler must exit 0');
const ir = JSON.parse(compileResult.stdout);

const envelope = {
  route: '/',
  file: fixturePath,
  ir,
  router: true
};

const bundlerResult = spawnSync(bundlerBin, ['--out-dir', outDir], {
  input: JSON.stringify(envelope),
  encoding: 'utf8'
});

console.log('BUNDLER BIN:', bundlerBin);
console.log('BUNDLER ARGS:', JSON.stringify(['--out-dir', outDir]));
console.log('BUNDLER EXIT:', bundlerResult.status);
console.log('BUNDLER STDERR:', bundlerResult.stderr.trim() || '<empty>');

assert.equal(bundlerResult.status, 0, 'bundler must exit 0');
assert.equal(fs.existsSync(outDir), true, 'out dir must exist');

const htmlPath = path.join(outDir, 'index.html');
assert.equal(fs.existsSync(htmlPath), true, 'index.html must be written');
const manifestPath = path.join(outDir, 'manifest.json');
assert.equal(fs.existsSync(manifestPath), true, 'manifest.json must be written');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.equal(typeof manifest.core, 'string', 'manifest.core must be present');
assert.ok(/^\/assets\/core\.[0-9a-f]{8}\.js$/.test(manifest.core), 'manifest.core must point to emitted core asset');
assert.equal(
  fs.existsSync(path.join(outDir, manifest.core.replace(/^\/+/, ''))),
  true,
  'manifest.core asset must exist'
);

const tree = listTree(outDir);
console.log('DIST TREE:');
for (const line of tree) {
  console.log(` - ${line}`);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const styleLinks = html.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g) || [];
const moduleScripts = html.match(/<script\b[^>]*type="module"[^>]*>/g) || [];
assert.equal(styleLinks.length, 1, 'index.html must include exactly one stylesheet link');
assert.equal(moduleScripts.length, 1, 'index.html must include exactly one module script');
assert.ok(styleLinks[0].includes('/assets/styles.'), 'stylesheet link must target emitted manifest CSS');
assert.equal(
  html.includes('<!-- ZENITH_STYLES_ANCHOR -->'),
  false,
  'styles anchor must not remain after build'
);

if (Array.isArray(ir.expressions) && ir.expressions.length > 0) {
  const jsAssets = tree.filter((entry) => entry.endsWith('.js'));
  assert.ok(jsAssets.length > 0, 'JS asset expected when expressions exist');
  assert.ok(
    html.includes('<script type="module" src="/assets/'),
    'index.html must include runtime script tag when expressions exist'
  );

  const runtimeAssets = tree.filter((entry) => /^assets\/runtime\.[0-9a-f]{8}\.js$/.test(entry));
  assert.equal(runtimeAssets.length, 1, 'exactly one runtime asset must be emitted');
  const coreAssets = tree.filter((entry) => /^assets\/core\.[0-9a-f]{8}\.js$/.test(entry));
  assert.equal(coreAssets.length, 1, 'exactly one core asset must be emitted');

  const pageAssets = tree.filter((entry) => /^assets\/(?!runtime\.|router\.|core\.).+\.js$/.test(entry));
  assert.ok(pageAssets.length >= 1, 'at least one page module asset must be emitted');

  const pageSource = fs.readFileSync(path.join(outDir, pageAssets[0]), 'utf8');
  assert.equal(pageSource.includes('@zenithbuild/runtime'), false, 'page bundle must not contain bare runtime import');
  assert.equal(pageSource.includes('.zen'), false, 'page bundle must not contain .zen references');
  assert.ok(
    pageSource.includes("from './runtime.") && pageSource.includes('hydrate'),
    'page bundle must import emitted runtime asset relatively'
  );
  assert.ok(pageSource.includes('const __zenith_events = ['), 'page bundle must include frozen event table');
  assert.ok(pageSource.includes('const __zenith_markers = ['), 'page bundle must include frozen marker table');
  assert.equal((pageSource.match(/hydrate\(\{/g) || []).length, 1, 'page bundle must contain exactly one hydrate bootstrap call');
} else {
  assert.ok(!html.includes('<script type="module"'), 'no runtime script expected when expressions are empty');
}

const routerAssets = tree.filter((entry) => /^assets\/router\.[0-9a-f]{8}\.js$/.test(entry));
assert.equal(routerAssets.length, 1, 'exactly one router asset must be emitted when router=true');
const routerSource = fs.readFileSync(path.join(outDir, routerAssets[0]), 'utf8');
assert.equal(routerSource.includes('.zen'), false, 'router bundle must not contain .zen references');
assert.equal(routerSource.includes('fetch('), false, 'router bundle must not perform runtime fetch');
assert.equal(
  fs.existsSync(path.join(outDir, 'assets', 'router-manifest.json')),
  true,
  'router manifest must be emitted when router=true'
);
assert.ok(
  html.includes('<script type="module" src="/assets/router.'),
  'index.html must include router runtime script when router=true'
);

const jsAssets = tree.filter((entry) => entry.endsWith('.js'));
const staticImportRe = /\bimport\s+(?:[^'"\n;]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const dynamicImportRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const exportFromRe = /\bexport\s+[^'"\n;]*?\s+from\s+['"]([^'"]+)['"]/g;

for (const rel of jsAssets) {
  const abs = path.join(outDir, rel);
  const source = fs.readFileSync(abs, 'utf8');
  if (source.includes('zenith:')) {
    throw new Error(`runtime purity violation: emitted asset contains zenith:* specifier: ${rel}`);
  }
  const specs = new Set();

  for (const re of [staticImportRe, dynamicImportRe, exportFromRe]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source)) !== null) {
      specs.add(m[1]);
    }
  }

  for (const spec of specs) {
    let target;
    if (spec.startsWith('./') || spec.startsWith('../')) {
      target = path.resolve(path.dirname(abs), spec);
    } else if (spec.startsWith('/')) {
      target = path.join(outDir, spec.replace(/^\/+/, ''));
    } else {
      throw new Error(`unresolved bare import in emitted asset ${rel}: ${spec}`);
    }

    if (!fs.existsSync(target)) {
      throw new Error(`unresolved emitted import in ${rel}: ${spec} -> ${target}`);
    }
  }
}

console.log('Process seam validation passed');
