import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import oniguruma from 'vscode-oniguruma';
import textmate from 'vscode-textmate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const { loadWASM, OnigScanner, OnigString } = oniguruma;
const { Registry } = textmate;

const tsGrammar = {
  scopeName: 'source.ts',
  patterns: [
    { match: '=>', name: 'keyword.operator.arrow.ts' },
    { match: '\\b(?:const|let|function|return|if)\\b', name: 'keyword.control.ts' },
    { match: '[A-Za-z_$][\\w$]*', name: 'identifier.ts' },
    { match: '[(){}.,;]', name: 'punctuation.ts' },
    { match: '\\s+', name: 'text.whitespace.ts' }
  ]
};

const cssGrammar = {
  scopeName: 'source.css',
  patterns: [{ match: '.+', name: 'source.css' }]
};

async function loadRegistry() {
  const wasm = await fs.readFile(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await loadWASM(wasm.buffer);

  const grammarPath = path.join(packageRoot, 'syntaxes', 'zenith.tmLanguage.json');
  const zenithGrammar = JSON.parse(await fs.readFile(grammarPath, 'utf8'));

  return new Registry({
    onigLib: Promise.resolve({
      createOnigScanner(patterns) {
        return new OnigScanner(patterns);
      },
      createOnigString(text) {
        return new OnigString(text);
      }
    }),
    loadGrammar(scopeName) {
      if (scopeName === 'text.html.zenith') {
        return zenithGrammar;
      }
      if (scopeName === 'source.ts') {
        return tsGrammar;
      }
      if (scopeName === 'source.css') {
        return cssGrammar;
      }
      return null;
    }
  });
}

test('package contributes a single canonical Zenith language id', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.contributes.languages.length, 1);
  assert.equal(pkg.contributes.languages[0].id, 'zenith');
  assert.deepEqual(pkg.contributes.languages[0].extensions, ['.zen', '.zen.html', '.zenx']);

  const grammar = pkg.contributes.grammars[0];
  assert.equal(grammar.scopeName, 'text.html.zenith');
  assert.equal(grammar.embeddedLanguages['source.ts'], 'typescript');
  assert.equal(grammar.embeddedLanguages['source.css'], 'css');

  const serialized = JSON.stringify(pkg.contributes);
  assert.equal(/vue|svelte/i.test(serialized), false);
});

test('extension package ships the bundled server runtime dependencies and stdio launch path', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const extensionSource = await fs.readFile(path.join(packageRoot, 'src', 'extension.ts'), 'utf8');

  assert.equal(pkg.dependencies['@zenithbuild/compiler'], '0.6.17');
  assert.ok(pkg.dependencies['vscode-languageserver']);
  assert.ok(pkg.dependencies['vscode-languageserver-textdocument']);
  assert.match(extensionSource, /args:\s*\[serverPath,\s*'--stdio'\]/);
  assert.match(extensionSource, /args:\s*\['--inspect=6010',\s*serverPath,\s*'--stdio'\]/);
});

test('embedded TS scopes cover arrows inside on:* handlers', async () => {
  const registry = await loadRegistry();
  const grammar = await registry.loadGrammar('text.html.zenith');
  assert.ok(grammar, 'Zenith grammar must load');

  const line = '<button on:click={(event) => submit(event)}>{count.get()}</button>';
  const { tokens } = grammar.tokenizeLine(line);
  const arrowIndex = line.indexOf('=>');
  const arrowToken = tokens.find((token) => token.startIndex <= arrowIndex && token.endIndex > arrowIndex);

  assert.ok(arrowToken, 'Arrow token must be present');
  assert.ok(arrowToken.scopes.includes('source.ts'), `Expected source.ts scopes, got ${arrowToken.scopes.join(' | ')}`);
  assert.ok(arrowToken.scopes.includes('keyword.operator.arrow.ts'), 'Arrow should come from TypeScript tokenization');
});
