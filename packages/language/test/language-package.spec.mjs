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

test('extension package ships the bundled server runtime dependencies and VS Code module transport startup path', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const extensionSource = await fs.readFile(path.join(packageRoot, 'src', 'extension.ts'), 'utf8');

  assert.equal(pkg.dependencies['@zenithbuild/compiler'], '0.6.18');
  assert.ok(pkg.dependencies['vscode-languageserver']);
  assert.ok(pkg.dependencies['vscode-languageserver-textdocument']);
  assert.match(extensionSource, /module:\s*serverPath/);
  assert.match(extensionSource, /transport:\s*TransportKind\.stdio/);
  assert.match(extensionSource, /execArgv:\s*\['--inspect=6010'\]/);
  assert.doesNotMatch(extensionSource, /process\.execPath/);
});

test('extension package exposes a deterministic VSIX packaging workflow', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const packagingScript = await fs.readFile(path.join(packageRoot, 'scripts', 'package-vsix.mjs'), 'utf8');
  await fs.access(path.join(packageRoot, 'scripts', 'package-vsix.mjs'));

  assert.equal(pkg.scripts['package:vsix'], 'bun run build && node scripts/package-vsix.mjs');
  assert.match(packagingScript, /stageLocalInstallPackage\('compiler'/);
  assert.match(packagingScript, /file:\.\/\.zenith-local\/compiler/);
  assert.match(packagingScript, /platformCompilerRoots/);
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

test('server script blocks embed TypeScript scopes', async () => {
  const registry = await loadRegistry();
  const grammar = await registry.loadGrammar('text.html.zenith');
  assert.ok(grammar, 'Zenith grammar must load');

  let ruleStack = null;
  const lines = [
    '<script server lang="ts">',
    'const x = 1',
    '</script>'
  ];

  let constToken;
  for (const line of lines) {
    const result = grammar.tokenizeLine(line, ruleStack);
    ruleStack = result.ruleStack;
    if (line === 'const x = 1') {
      constToken = result.tokens.find((token) => token.startIndex === 0);
    }
  }

  assert.ok(constToken, 'Token for const must be found inside server script');
  assert.ok(
    constToken.scopes.includes('source.ts'),
    `Expected source.ts scope in server script, got ${constToken.scopes.join(' | ')}`
  );
});

test('setup script blocks embed TypeScript scopes', async () => {
  const registry = await loadRegistry();
  const grammar = await registry.loadGrammar('text.html.zenith');
  assert.ok(grammar, 'Zenith grammar must load');

  let ruleStack = null;
  const lines = [
    '<script setup="ts">',
    'import Component from "./Component.zen"',
    '</script>'
  ];

  let importToken;
  for (const line of lines) {
    const result = grammar.tokenizeLine(line, ruleStack);
    ruleStack = result.ruleStack;
    if (line.startsWith('import')) {
      importToken = result.tokens.find((token) => token.startIndex === 0);
    }
  }

  assert.ok(importToken, 'Token for import must be found inside setup script');
  assert.ok(
    importToken.scopes.includes('source.ts'),
    `Expected source.ts scope in setup script, got ${importToken.scopes.join(' | ')}`
  );
});

test('snippet file contains no React/Vue/Svelte/JSX framework drift', async () => {
  const snippets = JSON.parse(
    await fs.readFile(path.join(packageRoot, 'snippets', 'zenith.code-snippets'), 'utf8')
  );
  const serialized = JSON.stringify(snippets).toLowerCase();

  assert.equal(/\breact\b/i.test(serialized), false, 'snippets must not reference React');
  assert.equal(/\bvue\b/i.test(serialized), false, 'snippets must not reference Vue');
  assert.equal(/\bsvelte\b/i.test(serialized), false, 'snippets must not reference Svelte');
  assert.equal(/\bjsx\b/i.test(serialized), false, 'snippets must not reference JSX');
  assert.equal(/\bonClick\b/.test(serialized), false, 'snippets must not use onClick (React pattern)');
  assert.equal(/\b@click\b/.test(serialized), false, 'snippets must not use @click (Vue pattern)');
});

test('language-configuration includes wordPattern and indentation rules', async () => {
  const config = JSON.parse(
    await fs.readFile(path.join(packageRoot, 'language-configuration.json'), 'utf8')
  );

  assert.ok(config.wordPattern, 'language config must define a wordPattern');
  assert.ok(config.indentationRules, 'language config must define indentation rules');
  assert.ok(config.indentationRules.increaseIndentPattern, 'must have increaseIndentPattern');
  assert.ok(config.indentationRules.decreaseIndentPattern, 'must have decreaseIndentPattern');
  assert.ok(config.autoClosingPairs.some((pair) => pair.open === '<!--'), 'must auto-close HTML comments');
  assert.ok(config.surroundingPairs.some(([open]) => open === '<'), 'must support < > surrounding');
});
