import assert from 'node:assert/strict';
import { renderRouterModule } from './template.js';

const manifestJson = JSON.stringify(
  {
    entry: '/assets/runtime.11111111.js',
    css: '/assets/styles.22222222.css',
    core: '/assets/core.33333333.js',
    router: '/assets/router.44444444.js',
    hash: 'deadbeef',
    chunks: {
      '/': '/assets/index.aaaaaaa1.js',
      '/about': '/assets/about.bbbbbbb2.js'
    }
  },
  null,
  2
);

const source = renderRouterModule({
  manifestJson,
  runtimeImport: '/assets/runtime.11111111.js',
  coreImport: '/assets/core.33333333.js'
});

assert.equal(source.includes('.zen'), false, 'router output must not contain .zen');
assert.equal(source.includes('zenith:'), false, 'router output must not contain zenith:');
assert.ok(
  source.includes('import(__ZENITH_MANIFEST__.chunks[route])'),
  'router output must use manifest-driven dynamic imports'
);
assert.equal(source.includes('\r'), false, 'router output must use \\n newlines');

console.log('contract-scan.mjs passed');
