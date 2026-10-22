import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const siteRequire = createRequire(resolve(root, 'site/package.json'));
const sanitize = siteRequire('sanitize-html');
const typescript = siteRequire('typescript');

test('discarded iframe fallback cannot exhaust the sanitizer stack', () => {
  assert.doesNotThrow(() => sanitize('<iframe>'.repeat(20_000)));
  const input = ('<iframe>' + '<b>'.repeat(3)).repeat(50) + 'content';
  const html = sanitize(input, { allowedTags: ['b'], nestingLimit: 3 });
  let depth = 0;
  for (const tag of html.match(/<\/?b>/g) || []) {
    depth += tag === '<b>' ? 1 : -1;
    assert.ok(depth <= 3, 'discarded iframes must not restart nestingLimit');
  }
});

test('ordinary sanitized content and safe links retain their behavior', () => {
  assert.equal(
    sanitize('<p>Hello <strong>world</strong><script>alert(1)</script></p>'),
    '<p>Hello <strong>world</strong></p>',
  );
  assert.equal(sanitize('<a href="https://example.test/docs">Docs</a>'),
    '<a href="https://example.test/docs">Docs</a>');
  assert.equal(sanitize('<a href="javascript:alert(1)">Unsafe</a>'), '<a>Unsafe</a>');
});

test('query parsing and serialization reject neither hostile metadata nor ordinary arrays', () => {
  const qs = siteRequire('qs');
  for (const options of [{ plainObjects: true }, { allowPrototypes: true }]) {
    for (const input of ['x%5Bconstructor%5D%5BisBuffer%5D=y', 'x[constructor][isBuffer]=y']) {
      assert.doesNotThrow(() => qs.stringify(qs.parse(input, options)));
    }
  }
  const ordinary = { tags: ['one', 'two'] };
  assert.deepEqual(qs.parse(qs.stringify(ordinary)), ordinary);
  assert.throws(() => qs.parse('a[21]=x,y,z', {
    comma: true, arrayLimit: 20, throwOnLimitExceeded: true,
  }), RangeError);
});

test('flat selector parsing stays bounded and preserves ordinary selectors', () => {
  const parser = siteRequire('postcss-selector-parser');
  assert.equal(parser().processSync('.content > a:hover'), '.content > a:hover');
  const entry = siteRequire.resolve('postcss-selector-parser');
  const result = spawnSync(process.execPath, ['-e', `
    const parser = require(${JSON.stringify(entry)});
    const selector = '.a'.repeat(200000);
    if (parser().processSync(selector) !== selector) process.exitCode = 1;
  `], { timeout: 10_000, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('esbuild serves local content without granting an unrelated origin browser access', async () => {
  const esbuild = siteRequire('esbuild');
  const directory = await mkdtemp(resolve(tmpdir(), 'jud21-esbuild-'));
  let context;
  try {
    await writeFile(resolve(directory, 'index.html'), '<p>local development control</p>');
    context = await esbuild.context({ stdin: { contents: 'console.log("local")' }, write: false });
    const { port } = await context.serve({ servedir: directory, host: '127.0.0.1', port: 0 });
    const url = `http://127.0.0.1:${port}/index.html`;
    const local = await fetch(url);
    assert.equal(local.status, 200);
    assert.match(await local.text(), /local development control/);
    const external = await fetch(url, { headers: { Origin: 'https://attacker.example.test' } });
    assert.equal(external.headers.get('access-control-allow-origin'), null);
    await external.body?.cancel();
  } finally {
    await context?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test('Tina generates client source without evaluating branch or token input', async () => {
  const cli = readFileSync(siteRequire.resolve('@tinacms/cli'), 'utf8');
  const source = typescript.createSourceFile('cli.js', cli,
    typescript.ScriptTarget.Latest, true, typescript.ScriptKind.JS);
  let method;
  const visit = (node) => {
    if (typescript.isMethodDeclaration(node) && node.name?.getText(source) === 'genClient') {
      assert.equal(method, undefined, 'the client generation boundary must be unambiguous');
      method = node.getText(source);
    }
    typescript.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(method, 'the installed CLI must expose the tested generation boundary');
  const generate = vm.runInNewContext(`({${method}}).genClient`);
  for (const branch of [
    "x'+(globalThis.__JUD21_PROBE='hit')+'",
    'x"+(globalThis.__JUD21_PROBE="hit")+"',
    'feature/safe-branch',
    'feature/quote\\line\n\u2028end',
  ]) {
    const url = `https://content.example.test/content/site/github/${branch}`;
    const token = "token'+(globalThis.__JUD21_PROBE='token')+'";
    const { clientString } = await generate.call({
      configManager: { config: { token } },
      noClientBuildCache: true,
      localContentBuild: false,
      getApiURL: () => url,
    });
    const context = { createClient: (options) => options, queries: {} };
    const code = clientString.replace(/^import .*;$/gm, '')
      .replace('export const client', 'globalThis.client').replace('export default client;', '');
    vm.runInNewContext(code, context);
    assert.equal(context.__JUD21_PROBE, undefined);
    assert.equal(context.client.url, url);
    assert.equal(context.client.token, token);
  }
});

test('Tina preview trusts its own origin and exact frame, independent of fragment input', () => {
  const appRoot = dirname(siteRequire.resolve('@tinacms/app/package.json'));
  const source = readFileSync(resolve(appRoot, 'src/lib/preview-origin.ts'), 'utf8');
  const code = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS },
  }).outputText;
  const context = { exports: {}, window: { location: { origin: 'https://admin.example.test' } } };
  vm.runInNewContext(code, context);
  const { getPreviewOrigin, isFromTrustedPreviewOrigin } = context.exports;
  const frame = {};
  const expectedOrigin = getPreviewOrigin();
  assert.equal(expectedOrigin, context.window.location.origin);
  for (const fragment of ['//attacker.example.test/p', '///attacker.example.test', '/\\attacker.example.test']) {
    const origin = new URL(fragment, expectedOrigin).origin;
    assert.equal(isFromTrustedPreviewOrigin({
      expectedOrigin, peerWindow: frame, event: { origin, source: frame },
    }), false);
  }
  assert.equal(isFromTrustedPreviewOrigin({
    expectedOrigin, peerWindow: frame, event: { origin: expectedOrigin, source: frame },
  }), true);
  assert.equal(isFromTrustedPreviewOrigin({
    expectedOrigin, peerWindow: frame, event: { origin: expectedOrigin, source: {} },
  }), false);
});
