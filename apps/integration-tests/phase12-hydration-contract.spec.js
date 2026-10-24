// PHASE 12 — Hydration + reactivity contract enforcement.
// Contract source: zenith-runtime/HYDRATION_CONTRACT.md

import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess } from './helpers/process.js';

jest.setTimeout(180000);

const FORBIDDEN_PATTERNS = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\brequire\s*\(/,
  /\bprocess\.env\b/,
  /\bDate\s*\(/,
  /\bMath\.random\s*\(/,
  /\bcrypto\.randomUUID\s*\(/,
  /\bfrom\s+['"]@[^'"]+['"]/,
  /\bimport\s+['"]@[^'"]+['"]/,
];

function parseScripts(html) {
  const scripts = [];
  const regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m = regex.exec(html);
  while (m) {
    const attrs = m[1] || '';
    scripts.push({
      attrs,
      src: /\bsrc\s*=\s*['"]([^'"]+)['"]/i.exec(attrs)?.[1] || null,
      runtime: /\bdata-zx-runtime\b/.test(attrs),
      page: /\bdata-zx-page\b/.test(attrs)
    });
    m = regex.exec(html);
  }
  return scripts;
}

function parseConstValue(source, name) {
  const patterns = [
    new RegExp(`const\\s+${name}\\s*=\\s*Object\\.freeze\\((\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\})\\);`),
    new RegExp(`const\\s+${name}\\s*=\\s*(\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\});`)
  ];
  let match = null;
  for (let i = 0; i < patterns.length; i++) {
    match = source.match(patterns[i]);
    if (match) break;
  }
  if (!match) {
    throw new Error(`missing const ${name}`);
  }
  return Function(`"use strict";return (${match[1]});`)();
}

function markerKindFromCode(kindCode) {
  if (kindCode === 1) return 'attr';
  if (kindCode === 2) return 'event';
  return 'text';
}

function inflateExpressionRows(rows) {
  return rows.map((tuple) => {
    const binding = {
      marker_index: tuple[0],
      signal_index: tuple.length > 5 && typeof tuple[5] === 'number' ? tuple[5] : null,
      signal_indices: tuple.length > 4 && Array.isArray(tuple[4]) ? tuple[4] : [],
      state_index: tuple.length > 3 && typeof tuple[3] === 'number' ? tuple[3] : null,
      component_instance: tuple.length > 7 ? tuple[7] : null,
      component_binding: tuple.length > 8 ? tuple[8] : null,
      literal: tuple.length > 1 ? tuple[1] : null,
      source: null
    };
    if (tuple.length > 6 && tuple[6] != null) {
      binding.fn_index = tuple[6];
    }
    return binding;
  });
}

function inflateMarkerRows(rows) {
  return rows.map((tuple) => {
    const marker = {
      index: tuple[0],
      kind: markerKindFromCode(tuple[1]),
      selector: tuple[2]
    };
    if (tuple.length > 4 && tuple[4] != null) {
      marker.attr = tuple[4];
    }
    return marker;
  });
}

async function buildFixture() {
  const root = await createTempProject('zenith-phase12');

  await scaffoldZenithProject(root, {
    router: false,
    pages: {
      'index.zen': '<script lang="ts">const title = "Home"; const url = "/next"; function inc() {}</script><main><button on:click={inc}>{title}</button><a href={url}>Go</a></main>'
    }
  });

  assertSuccess(npmInstall(root), 'npm install');
  assertSuccess(runCli(root, ['build']), 'zenith build');

  return { root, dist: path.join(root, 'dist') };
}

async function readPageBundle(dist) {
  const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
  const scripts = parseScripts(html);
  const page = scripts.find((script) => script.page);
  expect(page).toBeTruthy();
  const pagePath = path.join(dist, page.src.slice(1));
  const pageSource = await fs.readFile(pagePath, 'utf8');
  return { html, page, pagePath, pageSource };
}

function extractRuntimeModulePath(pagePath, pageSource) {
  const match = pageSource.match(/from ['"](\.\/runtime\.[^'"]+\.js)['"]/);
  expect(match).toBeTruthy();
  return path.join(path.dirname(pagePath), match[1]);
}

describe('Phase 12: hydration contract lock', () => {
  test('marker table length equals expression table length and indices are sequential', async () => {
    const { root, dist } = await buildFixture();

    const { pageSource: pageJs } = await readPageBundle(dist);
    const expr = parseConstValue(pageJs, '__zenith_payload_expression_rows');
    const markers = parseConstValue(pageJs, '__zenith_payload_marker_rows');
    const events = parseConstValue(pageJs, '__zenith_events');

    expect(Array.isArray(expr)).toBe(true);
    expect(Array.isArray(markers)).toBe(true);
    expect(Array.isArray(events)).toBe(true);

    expect(markers.length).toBe(expr.length);

    const indices = markers.map((item) => item[0]);
    expect(new Set(indices).size).toBe(indices.length);

    for (let i = 0; i < indices.length; i++) {
      expect(indices[i]).toBe(i);
    }

    for (const event of events) {
      expect(Number.isInteger(event.index)).toBe(true);
      expect(event.index).toBeGreaterThanOrEqual(0);
      expect(event.index).toBeLessThan(expr.length);
    }

    await fs.rm(root, { recursive: true, force: true });
  });

  test('page bundle contains exactly one hydrate bootstrap call and deterministic expression table across two builds', async () => {
    const { root, dist } = await buildFixture();

    const readCurrentPageBundle = async () => {
      const { pageSource: source } = await readPageBundle(dist);
      return {
        source,
        expr: parseConstValue(source, '__zenith_payload_expression_rows')
      };
    };

    const first = await readCurrentPageBundle();
    expect((first.source.match(/hydrate\s*\(\s*\{/g) || []).length).toBe(1);
    expect(first.source).toMatch(/const __zenith_ir_version\s*=\s*1;/);
    expect(first.source).toMatch(/ir_version:\s*__zenith_ir_version/);

    assertSuccess(runCli(root, ['build']), 'zenith build (repeat)');
    const second = await readCurrentPageBundle();

    expect(second.expr).toEqual(first.expr);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('runtime rejects reordered IR tables (mutation resistance)', async () => {
    const { root, dist } = await buildFixture();

    const { html, pagePath, pageSource } = await readPageBundle(dist);
    const runtimePath = extractRuntimeModulePath(pagePath, pageSource);
    const runtimeSource = await fs.readFile(runtimePath, 'utf8');

    const expressionRows = parseConstValue(pageSource, '__zenith_payload_expression_rows');
    const markerRows = parseConstValue(pageSource, '__zenith_payload_marker_rows');
    const expressions = inflateExpressionRows(expressionRows);
    const markers = inflateMarkerRows(markerRows);
    const events = parseConstValue(pageSource, '__zenith_events');
    const mutatedExpressions = [...expressions].reverse();
    const mutatedMarkers = [...markers].reverse();

    const dom = new JSDOM(html, { url: 'http://localhost/' });
    const context = vm.createContext({
      window: dom.window,
      document: dom.window.document,
      globalThis: dom.window,
      console,
      HTMLElement: dom.window.HTMLElement,
      Object,
      Set,
      Map,
      Array,
      Number,
      String,
      Boolean,
      RegExp,
      Error
    });

    const module = new vm.SourceTextModule(runtimeSource, {
      context,
      identifier: runtimePath
    });
    await module.link(async () => {
      throw new Error('runtime module must not import external modules');
    });
    await module.evaluate();

    const { hydrate } = module.namespace;
    expect(() => hydrate({
      ir_version: 1,
      root: dom.window.document,
      expressions: mutatedExpressions,
      markers,
      events,
      state_values: [],
      signals: [],
      components: []
    })).toThrow('expression table out of order');

    expect(() => hydrate({
      ir_version: 1,
      root: dom.window.document,
      expressions,
      markers: mutatedMarkers,
      events,
      state_values: [],
      signals: [],
      components: []
    })).toThrow('marker table out of order');

    await fs.rm(root, { recursive: true, force: true });
  });

  test('runtime hard-fails for corrupted component prop payload', async () => {
    const { root, dist } = await buildFixture();

    const { pagePath, pageSource } = await readPageBundle(dist);
    const runtimePath = extractRuntimeModulePath(pagePath, pageSource);
    const runtimeSource = await fs.readFile(runtimePath, 'utf8');

    const dom = new JSDOM('<Card data-zx-c="c0"><span data-zx-e="0"></span></Card>', {
      url: 'http://localhost/'
    });
    const context = vm.createContext({
      window: dom.window,
      document: dom.window.document,
      globalThis: dom.window,
      console,
      HTMLElement: dom.window.HTMLElement,
      Object,
      Set,
      Map,
      Array,
      Number,
      String,
      Boolean,
      RegExp,
      Error
    });
    const module = new vm.SourceTextModule(runtimeSource, {
      context,
      identifier: runtimePath
    });
    await module.link(async () => {
      throw new Error('runtime module must not import external modules');
    });
    await module.evaluate();

    const { hydrate } = module.namespace;
    expect(() => hydrate({
      ir_version: 1,
      root: dom.window.document,
      expressions: [{ marker_index: 0, literal: 'x' }],
      markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
      events: [],
      state_values: [],
      signals: [],
      components: [{
        instance: 'c0',
        selector: '[data-zx-c~="c0"]',
        props: [{ name: 'count', type: 'signal', index: 99 }],
        create: () => ({ mount() {}, destroy() {}, bindings: Object.freeze({}) })
      }]
    })).toThrow(/signal index .* did not resolve/);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('runtime hard-fails on duplicate/missing marker indices, unknown signals, and malformed event bindings', async () => {
    const { root, dist } = await buildFixture();

    const { pagePath, pageSource } = await readPageBundle(dist);
    const runtimePath = extractRuntimeModulePath(pagePath, pageSource);
    const runtimeSource = await fs.readFile(runtimePath, 'utf8');

    const dom = new JSDOM('<button id="btn" data-zx-on-click="0">seed</button>', {
      url: 'http://localhost/'
    });
    const context = vm.createContext({
      window: dom.window,
      document: dom.window.document,
      globalThis: dom.window,
      console,
      HTMLElement: dom.window.HTMLElement,
      Object,
      Set,
      Map,
      Array,
      Number,
      String,
      Boolean,
      RegExp,
      Error
    });
    const module = new vm.SourceTextModule(runtimeSource, {
      context,
      identifier: runtimePath
    });
    await module.link(async () => {
      throw new Error('runtime module must not import external modules');
    });
    await module.evaluate();

    const { hydrate } = module.namespace;
    const baseline = dom.window.document.querySelector('#btn')?.textContent || '';

    expect(() => hydrate({
      ir_version: 1,
      root: dom.window.document,
      expressions: [
        { marker_index: 0, literal: 'x' },
        { marker_index: 1, literal: 'y' }
      ],
      markers: [
        { index: 1, kind: 'event', selector: '#btn' },
        { index: 1, kind: 'event', selector: '#btn' }
      ],
      events: [{ index: 1, event: 'click', selector: '#btn' }],
      state_values: [],
      signals: [],
      components: []
    })).toThrow('marker table out of order');
    expect(dom.window.document.querySelector('#btn')?.textContent || '').toBe(baseline);

    expect(() => hydrate({
      ir_version: 1,
      root: dom.window.document,
      expressions: [
        { marker_index: 0, literal: 'x' },
        { marker_index: 1, literal: 'y' }
      ],
      markers: [{ index: 0, kind: 'event', selector: '#btn' }],
      events: [{ index: 0, event: 'click', selector: '#btn' }],
      state_values: [],
      signals: [],
      components: []
    })).toThrow('marker/expression mismatch');
    expect(dom.window.document.querySelector('#btn')?.textContent || '').toBe(baseline);

    expect(() => hydrate({
      ir_version: 1,
      root: dom.window.document,
      expressions: [{ marker_index: 0, signal_index: 999 }],
      markers: [{ index: 0, kind: 'text', selector: '#btn' }],
      events: [],
      state_values: [module.namespace.signal(0)],
      signals: [{ id: 0, kind: 'signal', state_index: 0 }],
      components: []
    })).toThrow('did not resolve to a signal');
    expect(dom.window.document.querySelector('#btn')?.textContent || '').toBe(baseline);

    expect(() => hydrate({
      ir_version: 1,
      root: dom.window.document,
      expressions: [{ marker_index: 0, state_index: 0 }],
      markers: [{ index: 0, kind: 'event', selector: '#btn' }],
      events: [{ index: 0, event: '', selector: '#btn' }],
      state_values: [() => {}],
      signals: [],
      components: []
    })).toThrow('requires event name');
    expect(dom.window.document.querySelector('#btn')?.textContent || '').toBe(baseline);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('runtime output has no forbidden primitives and hydrate does not pollute globals', async () => {
    const { root, dist } = await buildFixture();

    const { pagePath, pageSource } = await readPageBundle(dist);
    const runtimePath = extractRuntimeModulePath(pagePath, pageSource);
    const runtimeSource = await fs.readFile(runtimePath, 'utf8');

    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(pattern.test(runtimeSource)).toBe(false);
    }

    const dom = new JSDOM('<div data-zx-e="0"></div>', { url: 'http://localhost/' });
    const beforeKeys = new Set(Object.keys(dom.window));

    const context = vm.createContext({
      window: dom.window,
      document: dom.window.document,
      globalThis: dom.window,
      console,
      HTMLElement: dom.window.HTMLElement,
      Object,
      Set,
      Array,
      Number,
      String,
      Boolean,
      RegExp,
      Error
    });

    const module = new vm.SourceTextModule(runtimeSource, {
      context,
      identifier: runtimePath
    });

    await module.link(async () => {
      throw new Error('runtime module must not import external modules');
    });
    await module.evaluate();

    const exportKeys = Object.keys(module.namespace).sort();
    expect(exportKeys).toEqual(expect.arrayContaining(['hydrate', 'signal', 'state', 'zeneffect']));

    const { hydrate } = module.namespace;
    hydrate({
      ir_version: 1,
      root: dom.window.document,
      expressions: [{ marker_index: 0, literal: '"hello"' }],
      markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
      events: [],
      state_values: [],
      signals: [],
      components: []
    });

    const afterKeys = Object.keys(dom.window);
    const leaked = afterKeys.filter((key) => !beforeKeys.has(key));
    expect(leaked).toEqual([]);

    await fs.rm(root, { recursive: true, force: true });
  });
});
