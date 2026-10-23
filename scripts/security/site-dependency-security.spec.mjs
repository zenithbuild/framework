import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const siteRequire = createRequire(resolve(root, 'site/package.json'));
const sanitize = siteRequire('sanitize-html');

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
