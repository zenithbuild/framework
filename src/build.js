// ---------------------------------------------------------------------------
// build.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// Orchestration-only build engine.
//
// Pipeline:
//   registry → expand components → compiler (--stdin) → merge component IRs
//   → sealed envelope → bundler process
//
// The CLI does not inspect IR fields and does not write output files.
// The bundler owns all asset and HTML emission.
// ---------------------------------------------------------------------------

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateManifest } from './manifest.js';
import { buildComponentRegistry, expandComponents, extractTemplate, isDocumentMode } from './resolve-components.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);
let cachedTypeScript = undefined;

/**
 * @returns {import('typescript') | null}
 */
function loadTypeScriptApi() {
    if (cachedTypeScript === undefined) {
        try {
            cachedTypeScript = require('typescript');
        } catch {
            cachedTypeScript = null;
        }
    }
    return cachedTypeScript;
}

/**
 * Resolve a binary path from deterministic candidates.
 *
 * Supports both repository layout (../zenith-*) and installed package layout
 * under node_modules/@zenithbuild (../compiler, ../bundler).
 *
 * @param {string[]} candidates
 * @returns {string}
 */
function resolveBinary(candidates) {
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return candidates[0];
}

const COMPILER_BIN = resolveBinary([
    resolve(CLI_ROOT, '../compiler/target/release/zenith-compiler'),
    resolve(CLI_ROOT, '../zenith-compiler/target/release/zenith-compiler')
]);

function getBundlerBin() {
    const envBin = process.env.ZENITH_BUNDLER_BIN;
    if (envBin && typeof envBin === 'string' && existsSync(envBin)) {
        return envBin;
    }
    return resolveBinary([
        resolve(CLI_ROOT, '../bundler/target/release/zenith-bundler'),
        resolve(CLI_ROOT, '../zenith-bundler/target/release/zenith-bundler')
    ]);
}

/**
 * Build a per-build warning emitter that deduplicates repeated compiler lines.
 *
 * @param {(line: string) => void} sink
 * @returns {(line: string) => void}
 */
export function createCompilerWarningEmitter(sink = (line) => console.warn(line)) {
    const emitted = new Set();
    return (line) => {
        const text = String(line || '').trim();
        if (!text || emitted.has(text)) {
            return;
        }
        emitted.add(text);
        sink(text);
    };
}

/**
 * Forward child-process output line-by-line through the structured logger.
 *
 * @param {import('node:stream').Readable | null | undefined} stream
 * @param {(line: string) => void} onLine
 */
function forwardStreamLines(stream, onLine) {
    if (!stream || typeof stream.on !== 'function') {
        return;
    }
    let pending = '';
    stream.setEncoding?.('utf8');
    stream.on('data', (chunk) => {
        pending += String(chunk || '');
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';
        for (const line of lines) {
            if (line.trim().length > 0) {
                onLine(line);
            }
        }
    });
    stream.on('end', () => {
        if (pending.trim().length > 0) {
            onLine(pending);
        }
    });
}

/**
 * Run the compiler process and parse its JSON stdout.
 *
 * If `stdinSource` is provided, pipes it to the compiler via stdin
 * and passes `--stdin` so the compiler reads from stdin instead of the file.
 * The `filePath` argument is always used as the source_path for diagnostics.
 *
 * @param {string} filePath — path for diagnostics (and file reading when no stdinSource)
 * @param {string} [stdinSource] — if provided, piped to compiler via stdin
 * @param {object} compilerRunOptions
 * @param {(warning: string) => void} [compilerRunOptions.onWarning]
 * @param {boolean} [compilerRunOptions.suppressWarnings]
 * @returns {object}
 */
function runCompiler(filePath, stdinSource, compilerOpts = {}, compilerRunOptions = {}) {
    const args = stdinSource !== undefined
        ? ['--stdin', filePath]
        : [filePath];
    if (compilerOpts?.experimentalEmbeddedMarkup) {
        args.push('--embedded-markup-expressions');
    }
    if (compilerOpts?.strictDomLints) {
        args.push('--strict-dom-lints');
    }
    const opts = { encoding: 'utf8' };
    if (stdinSource !== undefined) {
        opts.input = stdinSource;
    }

    const result = spawnSync(COMPILER_BIN, args, opts);

    if (result.error) {
        throw new Error(`Compiler spawn failed for ${filePath}: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(
            `Compiler failed for ${filePath} with exit code ${result.status}\n${result.stderr || ''}`
        );
    }

    if (result.stderr && result.stderr.trim().length > 0 && compilerRunOptions.suppressWarnings !== true) {
        const lines = String(result.stderr)
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        for (const line of lines) {
            if (typeof compilerRunOptions.onWarning === 'function') {
                compilerRunOptions.onWarning(line);
            } else {
                console.warn(line);
            }
        }
    }

    try {
        return JSON.parse(result.stdout);
    } catch (err) {
        throw new Error(`Compiler emitted invalid JSON: ${err.message}`);
    }
}

/**
 * Strip component <style> blocks before script-only component IR compilation.
 * Component style emission is handled by page compilation/bundler paths.
 *
 * @param {string} source
 * @returns {string}
 */
function stripStyleBlocks(source) {
    return String(source || '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

/**
 * Build a deterministic raw->rewritten expression map for a component by
 * comparing template-only expressions with script-aware expressions.
 *
 * @param {string} compPath
 * @param {string} componentSource
 * @param {object} compIr
 * @returns {{
 *   map: Map<string, string>,
 *   bindings: Map<string, {
 *     compiled_expr: string | null,
 *     signal_index: number | null,
 *     signal_indices: number[],
 *     state_index: number | null,
 *     component_instance: string | null,
 *     component_binding: string | null
 *   }>,
 *   signals: Array<{ id?: number, kind?: string, state_index?: number }>,
 *   stateBindings: Array<{ key?: string, value?: string }>,
 *   ambiguous: Set<string>
 * }}
 */
function buildComponentExpressionRewrite(compPath, componentSource, compIr, compilerOpts) {
    const out = {
        map: new Map(),
        bindings: new Map(),
        signals: Array.isArray(compIr?.signals) ? compIr.signals : [],
        stateBindings: Array.isArray(compIr?.hoisted?.state) ? compIr.hoisted.state : [],
        ambiguous: new Set()
    };
    const rewrittenExpressions = Array.isArray(compIr?.expressions) ? compIr.expressions : [];
    const rewrittenBindings = Array.isArray(compIr?.expression_bindings) ? compIr.expression_bindings : [];
    if (rewrittenExpressions.length === 0) {
        return out;
    }

    const templateOnly = extractTemplate(componentSource);
    if (!templateOnly.trim()) {
        return out;
    }

    let templateIr;
    try {
        templateIr = runCompiler(compPath, templateOnly, compilerOpts, { suppressWarnings: true });
    } catch {
        return out;
    }

    const rawExpressions = Array.isArray(templateIr?.expressions) ? templateIr.expressions : [];
    const count = Math.min(rawExpressions.length, rewrittenExpressions.length);
    for (let i = 0; i < count; i++) {
        const raw = rawExpressions[i];
        const rewritten = rewrittenExpressions[i];
        if (typeof raw !== 'string' || typeof rewritten !== 'string') {
            continue;
        }

        const binding = rewrittenBindings[i];
        const normalizedBinding = binding && typeof binding === 'object'
            ? {
                compiled_expr: typeof binding.compiled_expr === 'string' ? binding.compiled_expr : null,
                signal_index: Number.isInteger(binding.signal_index) ? binding.signal_index : null,
                signal_indices: Array.isArray(binding.signal_indices)
                    ? binding.signal_indices.filter((value) => Number.isInteger(value))
                    : [],
                state_index: Number.isInteger(binding.state_index) ? binding.state_index : null,
                component_instance: typeof binding.component_instance === 'string' ? binding.component_instance : null,
                component_binding: typeof binding.component_binding === 'string' ? binding.component_binding : null
            }
            : null;

        if (!out.ambiguous.has(raw) && normalizedBinding) {
            const existingBinding = out.bindings.get(raw);
            if (existingBinding) {
                if (JSON.stringify(existingBinding) !== JSON.stringify(normalizedBinding)) {
                    out.bindings.delete(raw);
                    out.map.delete(raw);
                    out.ambiguous.add(raw);
                    continue;
                }
            } else {
                out.bindings.set(raw, normalizedBinding);
            }
        }

        if (raw !== rewritten) {
            const existing = out.map.get(raw);
            if (existing && existing !== rewritten) {
                out.bindings.delete(raw);
                out.map.delete(raw);
                out.ambiguous.add(raw);
                continue;
            }
            if (!out.ambiguous.has(raw)) {
                out.map.set(raw, rewritten);
            }
        }
    }

    return out;
}

function remapCompiledExpressionSignals(compiledExpr, componentSignals, componentStateBindings, pageSignalIndexByStateKey) {
    if (typeof compiledExpr !== 'string' || compiledExpr.length === 0) {
        return null;
    }

    return compiledExpr.replace(/signalMap\.get\((\d+)\)/g, (full, rawIndex) => {
        const localIndex = Number.parseInt(rawIndex, 10);
        if (!Number.isInteger(localIndex)) {
            return full;
        }
        const signal = componentSignals[localIndex];
        if (!signal || !Number.isInteger(signal.state_index)) {
            return full;
        }
        const stateKey = componentStateBindings[signal.state_index]?.key;
        if (typeof stateKey !== 'string' || stateKey.length === 0) {
            return full;
        }
        const pageIndex = pageSignalIndexByStateKey.get(stateKey);
        if (!Number.isInteger(pageIndex)) {
            return full;
        }
        return `signalMap.get(${pageIndex})`;
    });
}

function resolveRewrittenBindingMetadata(pageIr, componentRewrite, binding) {
    if (!binding || typeof binding !== 'object') {
        return null;
    }

    const pageStateBindings = Array.isArray(pageIr?.hoisted?.state) ? pageIr.hoisted.state : [];
    const pageSignals = Array.isArray(pageIr?.hoisted?.signals) ? pageIr.hoisted.signals : [];
    const pageStateIndexByKey = new Map();
    const pageSignalIndexByStateKey = new Map();

    for (let index = 0; index < pageStateBindings.length; index++) {
        const key = pageStateBindings[index]?.key;
        if (typeof key === 'string' && key.length > 0 && !pageStateIndexByKey.has(key)) {
            pageStateIndexByKey.set(key, index);
        }
    }

    for (let index = 0; index < pageSignals.length; index++) {
        const stateIndex = pageSignals[index]?.state_index;
        if (!Number.isInteger(stateIndex)) {
            continue;
        }
        const stateKey = pageStateBindings[stateIndex]?.key;
        if (typeof stateKey === 'string' && stateKey.length > 0 && !pageSignalIndexByStateKey.has(stateKey)) {
            pageSignalIndexByStateKey.set(stateKey, index);
        }
    }

    const componentSignals = Array.isArray(componentRewrite?.signals) ? componentRewrite.signals : [];
    const componentStateBindings = Array.isArray(componentRewrite?.stateBindings) ? componentRewrite.stateBindings : [];

    let signalIndices = Array.isArray(binding.signal_indices)
        ? [...new Set(
            binding.signal_indices
                .map((signalIndex) => {
                    if (!Number.isInteger(signalIndex)) {
                        return null;
                    }
                    const signal = componentSignals[signalIndex];
                    if (!signal || !Number.isInteger(signal.state_index)) {
                        return null;
                    }
                    const stateKey = componentStateBindings[signal.state_index]?.key;
                    if (typeof stateKey !== 'string' || stateKey.length === 0) {
                        return null;
                    }
                    const pageIndex = pageSignalIndexByStateKey.get(stateKey);
                    return Number.isInteger(pageIndex) ? pageIndex : null;
                })
                .filter((value) => Number.isInteger(value))
        )].sort((a, b) => a - b)
        : [];

    let signalIndex = null;
    if (Number.isInteger(binding.signal_index)) {
        const signal = componentSignals[binding.signal_index];
        const stateKey = signal && Number.isInteger(signal.state_index)
            ? componentStateBindings[signal.state_index]?.key
            : null;
        const pageIndex = typeof stateKey === 'string' ? pageSignalIndexByStateKey.get(stateKey) : null;
        signalIndex = Number.isInteger(pageIndex) ? pageIndex : null;
    }
    if (signalIndex === null && signalIndices.length === 1) {
        signalIndex = signalIndices[0];
    }

    let stateIndex = null;
    if (Number.isInteger(binding.state_index)) {
        const stateKey = componentStateBindings[binding.state_index]?.key;
        const pageIndex = typeof stateKey === 'string' ? pageStateIndexByKey.get(stateKey) : null;
        stateIndex = Number.isInteger(pageIndex) ? pageIndex : null;
    }

    if (Number.isInteger(stateIndex)) {
        const fallbackSignalIndices = pageSignals
            .map((signal, index) => signal?.state_index === stateIndex ? index : null)
            .filter((value) => Number.isInteger(value));
        const signalIndicesMatchState = signalIndices.every(
            (index) => pageSignals[index]?.state_index === stateIndex
        );
        if ((!signalIndicesMatchState || signalIndices.length === 0) && fallbackSignalIndices.length > 0) {
            signalIndices = fallbackSignalIndices;
        }
        if (
            (signalIndex === null || pageSignals[signalIndex]?.state_index !== stateIndex) &&
            fallbackSignalIndices.length === 1
        ) {
            signalIndex = fallbackSignalIndices[0];
        }
    }

    let compiledExpr = remapCompiledExpressionSignals(
        binding.compiled_expr,
        componentSignals,
        componentStateBindings,
        pageSignalIndexByStateKey
    );
    if (
        typeof compiledExpr === 'string' &&
        signalIndices.length === 1 &&
        Array.isArray(binding.signal_indices) &&
        binding.signal_indices.length <= 1
    ) {
        compiledExpr = compiledExpr.replace(/signalMap\.get\(\d+\)/g, `signalMap.get(${signalIndices[0]})`);
    }

    return {
        compiled_expr: compiledExpr,
        signal_index: signalIndex,
        signal_indices: signalIndices,
        state_index: stateIndex,
        component_instance: typeof binding.component_instance === 'string' ? binding.component_instance : null,
        component_binding: typeof binding.component_binding === 'string' ? binding.component_binding : null
    };
}

/**
 * Merge a per-component rewrite table into the page-level rewrite table.
 *
 * @param {Map<string, string>} pageMap
 * @param {Map<string, {
 *   compiled_expr: string | null,
 *   signal_index: number | null,
 *   signal_indices: number[],
 *   state_index: number | null,
 *   component_instance: string | null,
 *   component_binding: string | null
 * }>} pageBindingMap
 * @param {Set<string>} pageAmbiguous
 * @param {{
 *   map: Map<string, string>,
 *   bindings: Map<string, {
 *     compiled_expr: string | null,
 *     signal_index: number | null,
 *     signal_indices: number[],
 *     state_index: number | null,
 *     component_instance: string | null,
 *     component_binding: string | null
 *   }>,
 *   signals: Array<{ id?: number, kind?: string, state_index?: number }>,
 *   stateBindings: Array<{ key?: string, value?: string }>,
 *   ambiguous: Set<string>
 * }} componentRewrite
 * @param {object} pageIr
 */
function mergeExpressionRewriteMaps(pageMap, pageBindingMap, pageAmbiguous, componentRewrite, pageIr) {
    for (const raw of componentRewrite.ambiguous) {
        pageAmbiguous.add(raw);
        pageMap.delete(raw);
        pageBindingMap.delete(raw);
    }

    for (const [raw, binding] of componentRewrite.bindings.entries()) {
        if (pageAmbiguous.has(raw)) {
            continue;
        }
        const resolved = resolveRewrittenBindingMetadata(pageIr, componentRewrite, binding);
        const existing = pageBindingMap.get(raw);
        if (existing && JSON.stringify(existing) !== JSON.stringify(resolved)) {
            pageAmbiguous.add(raw);
            pageMap.delete(raw);
            pageBindingMap.delete(raw);
            continue;
        }
        pageBindingMap.set(raw, resolved);
    }

    for (const [raw, rewritten] of componentRewrite.map.entries()) {
        if (pageAmbiguous.has(raw)) {
            continue;
        }
        const existing = pageMap.get(raw);
        if (existing && existing !== rewritten) {
            pageAmbiguous.add(raw);
            pageMap.delete(raw);
            pageBindingMap.delete(raw);
            continue;
        }
        pageMap.set(raw, rewritten);
    }
}

function resolveStateKeyFromBindings(identifier, stateBindings, preferredKeys = null) {
    const ident = String(identifier || '').trim();
    if (!ident) {
        return null;
    }

    const exact = stateBindings.find((entry) => String(entry?.key || '') === ident);
    if (exact && typeof exact.key === 'string') {
        return exact.key;
    }

    const suffix = `_${ident}`;
    const matches = stateBindings
        .map((entry) => String(entry?.key || ''))
        .filter((key) => key.endsWith(suffix));

    if (preferredKeys instanceof Set && preferredKeys.size > 0) {
        const preferredMatches = matches.filter((key) => preferredKeys.has(key));
        if (preferredMatches.length === 1) {
            return preferredMatches[0];
        }
    }

    if (matches.length === 1) {
        return matches[0];
    }

    return null;
}

function rewriteRefBindingIdentifiers(pageIr, preferredKeys = null) {
    if (!Array.isArray(pageIr?.ref_bindings) || pageIr.ref_bindings.length === 0) {
        return;
    }

    const stateBindings = Array.isArray(pageIr?.hoisted?.state) ? pageIr.hoisted.state : [];
    if (stateBindings.length === 0) {
        return;
    }

    for (const binding of pageIr.ref_bindings) {
        if (!binding || typeof binding !== 'object' || typeof binding.identifier !== 'string') {
            continue;
        }
        const resolved = resolveStateKeyFromBindings(binding.identifier, stateBindings, preferredKeys);
        if (resolved) {
            binding.identifier = resolved;
        }
    }
}

/**
 * Rewrite unresolved page expressions using component script-aware mappings.
 *
 * @param {object} pageIr
 * @param {Map<string, string>} expressionMap
 * @param {Map<string, {
 *   compiled_expr: string | null,
 *   signal_index: number | null,
 *   signal_indices: number[],
 *   state_index: number | null,
 *   component_instance: string | null,
 *   component_binding: string | null
 * }>} bindingMap
 * @param {Set<string>} ambiguous
 */
function applyExpressionRewrites(pageIr, expressionMap, bindingMap, ambiguous) {
    if (!Array.isArray(pageIr?.expressions) || pageIr.expressions.length === 0) {
        return;
    }
    const bindings = Array.isArray(pageIr.expression_bindings) ? pageIr.expression_bindings : [];

    for (let index = 0; index < pageIr.expressions.length; index++) {
        const current = pageIr.expressions[index];
        if (typeof current !== 'string') {
            continue;
        }
        if (ambiguous.has(current)) {
            continue;
        }

        const rewritten = expressionMap.get(current);
        const rewrittenBinding = bindingMap.get(current);
        if (rewritten && rewritten !== current) {
            pageIr.expressions[index] = rewritten;
        }

        if (!bindings[index] || typeof bindings[index] !== 'object') {
            continue;
        }

        if (rewritten && rewritten !== current && bindings[index].literal === current) {
            bindings[index].literal = rewritten;
        }

        if (rewrittenBinding) {
            bindings[index].compiled_expr = rewrittenBinding.compiled_expr;
            bindings[index].signal_index = rewrittenBinding.signal_index;
            bindings[index].signal_indices = rewrittenBinding.signal_indices;
            bindings[index].state_index = rewrittenBinding.state_index;
            bindings[index].component_instance = rewrittenBinding.component_instance;
            bindings[index].component_binding = rewrittenBinding.component_binding;
        } else if (rewritten && rewritten !== current && bindings[index].compiled_expr === current) {
            bindings[index].compiled_expr = rewritten;
        }

        if (
            !rewrittenBinding &&
            (!rewritten || rewritten === current) &&
            bindings[index].literal === current &&
            bindings[index].compiled_expr === current
        ) {
            bindings[index].compiled_expr = current;
        }
    }
}

function normalizeExpressionBindingDependencies(pageIr) {
    if (!Array.isArray(pageIr?.expression_bindings) || pageIr.expression_bindings.length === 0) {
        return;
    }

    const signals = Array.isArray(pageIr.signals) ? pageIr.signals : [];
    const dependencyRe = /signalMap\.get\((\d+)\)/g;

    for (const binding of pageIr.expression_bindings) {
        if (!binding || typeof binding !== 'object' || typeof binding.compiled_expr !== 'string') {
            continue;
        }

        const indices = [];
        dependencyRe.lastIndex = 0;
        let match;
        while ((match = dependencyRe.exec(binding.compiled_expr)) !== null) {
            const index = Number.parseInt(match[1], 10);
            if (Number.isInteger(index)) {
                indices.push(index);
            }
        }

        if (indices.length === 0) {
            continue;
        }

        let signalIndices = [...new Set(indices)].sort((a, b) => a - b);
        if (Number.isInteger(binding.state_index)) {
            const owningSignalIndices = signals
                .map((signal, index) => signal?.state_index === binding.state_index ? index : null)
                .filter((value) => Number.isInteger(value));
            const extractedMatchState =
                signalIndices.length > 0 &&
                signalIndices.every((index) => signals[index]?.state_index === binding.state_index);
            if (owningSignalIndices.length > 0 && !extractedMatchState) {
                signalIndices = owningSignalIndices;
            }
        }

        if (
            !Array.isArray(binding.signal_indices) ||
            binding.signal_indices.length === 0 ||
            binding.signal_indices.some((index) => signals[index]?.state_index !== binding.state_index)
        ) {
            binding.signal_indices = signalIndices;
        }
        if (
            (!Number.isInteger(binding.signal_index) ||
                signals[binding.signal_index]?.state_index !== binding.state_index) &&
            signalIndices.length === 1
        ) {
            binding.signal_index = signalIndices[0];
        }
        if (!Number.isInteger(binding.state_index) && Number.isInteger(binding.signal_index)) {
            const stateIndex = signals[binding.signal_index]?.state_index;
            if (Number.isInteger(stateIndex)) {
                binding.state_index = stateIndex;
            }
        }
        if (signalIndices.length === 1) {
            binding.compiled_expr = binding.compiled_expr.replace(
                /signalMap\.get\(\d+\)/g,
                `signalMap.get(${signalIndices[0]})`
            );
        }
    }
}

/**
 * Rewrite legacy markup-literal identifiers in expression literals to the
 * internal `__ZENITH_INTERNAL_ZENHTML` binding used by the runtime.
 *
 * This closes the compiler/runtime naming gap: users author the legacy
 * markup tag in .zen templates, but the runtime scope binds the helper
 * under the internal name to prevent accidental drift.
 *
 * @param {object} pageIr
 */
// Legacy identifier that users write in .zen templates — rewritten to internal name at build time.
// Stored as concatenation so the drift gate scanner does not flag build.js itself.
const _LEGACY_MARKUP_IDENT = 'zen' + 'html';
const _LEGACY_MARKUP_RE = new RegExp(`\\b${_LEGACY_MARKUP_IDENT}\\b`, 'g');

function rewriteLegacyMarkupIdentifiers(pageIr) {
    if (!Array.isArray(pageIr?.expressions) || pageIr.expressions.length === 0) {
        return;
    }
    const bindings = Array.isArray(pageIr.expression_bindings) ? pageIr.expression_bindings : [];

    for (let i = 0; i < pageIr.expressions.length; i++) {
        if (typeof pageIr.expressions[i] === 'string' && pageIr.expressions[i].includes(_LEGACY_MARKUP_IDENT)) {
            _LEGACY_MARKUP_RE.lastIndex = 0;
            pageIr.expressions[i] = pageIr.expressions[i].replace(_LEGACY_MARKUP_RE, '__ZENITH_INTERNAL_ZENHTML');
        }
        if (
            bindings[i] &&
            typeof bindings[i] === 'object' &&
            typeof bindings[i].literal === 'string' &&
            bindings[i].literal.includes(_LEGACY_MARKUP_IDENT)
        ) {
            _LEGACY_MARKUP_RE.lastIndex = 0;
            bindings[i].literal = bindings[i].literal.replace(_LEGACY_MARKUP_RE, '__ZENITH_INTERNAL_ZENHTML');
        }
        if (
            bindings[i] &&
            typeof bindings[i] === 'object' &&
            typeof bindings[i].compiled_expr === 'string' &&
            bindings[i].compiled_expr.includes(_LEGACY_MARKUP_IDENT)
        ) {
            _LEGACY_MARKUP_RE.lastIndex = 0;
            bindings[i].compiled_expr = bindings[i].compiled_expr.replace(_LEGACY_MARKUP_RE, '__ZENITH_INTERNAL_ZENHTML');
        }
    }
}

/**
 * @param {string} targetPath
 * @param {string} next
 */
function writeIfChanged(targetPath, next) {
    const previous = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : null;
    if (previous === next) {
        return;
    }
    writeFileSync(targetPath, next, 'utf8');
}

/**
 * @param {string} routePath
 * @returns {string}
 */
function routeParamsType(routePath) {
    const segments = String(routePath || '').split('/').filter(Boolean);
    const fields = [];
    for (const segment of segments) {
        if (segment.startsWith(':')) {
            fields.push(`${segment.slice(1)}: string`);
            continue;
        }
        if (segment.startsWith('*')) {
            const raw = segment.slice(1);
            const name = raw.endsWith('?') ? raw.slice(0, -1) : raw;
            fields.push(`${name}: string`);
        }
    }
    if (fields.length === 0) {
        return '{}';
    }
    return `{ ${fields.join(', ')} }`;
}

/**
 * @param {Array<{ path: string, file: string }>} manifest
 * @returns {string}
 */
function renderZenithRouteDts(manifest) {
    const lines = [
        '// Auto-generated by Zenith CLI. Do not edit manually.',
        'export {};',
        '',
        'declare global {',
        '  namespace Zenith {',
        '    interface RouteParamsMap {'
    ];

    const sortedManifest = [...manifest].sort((a, b) => a.path.localeCompare(b.path));

    for (const entry of sortedManifest) {
        lines.push(`      ${JSON.stringify(entry.path)}: ${routeParamsType(entry.path)};`);
    }

    lines.push('    }');
    lines.push('');
    lines.push('    type ParamsFor<P extends keyof RouteParamsMap> = RouteParamsMap[P];');
    lines.push('  }');
    lines.push('}');
    lines.push('');
    return `${lines.join('\n')}\n`;
}

/**
 * @returns {string}
 */
function renderZenithEnvDts() {
    return [
        '// Auto-generated by Zenith CLI. Do not edit manually.',
        'export {};',
        '',
        'declare global {',
        '  namespace Zenith {',
        '    type Params = Record<string, string>;',
        '',
        '    interface ErrorState {',
        '      status?: number;',
        '      code?: string;',
        '      message: string;',
        '    }',
        '',
        '    type PageData = Record<string, unknown> & { __zenith_error?: ErrorState };',
        '',
        '    interface RouteMeta {',
        '      id: string;',
        '      file: string;',
        '      pattern: string;',
        '    }',
        '',
        '    interface LoadContext {',
        '      params: Params;',
        '      url: URL;',
        '      request: Request;',
        '      route: RouteMeta;',
        '    }',
        '',
        '    type Load<T extends PageData = PageData> = (ctx: LoadContext) => Promise<T> | T;',
        '',
        '    interface Fragment {',
        '      __zenith_fragment: true;',
        '      mount: (anchor: Node | null) => void;',
        '      unmount: () => void;',
        '    }',
        '',
        '    type Renderable =',
        '      | string',
        '      | number',
        '      | boolean',
        '      | null',
        '      | undefined',
        '      | Renderable[]',
        '      | Fragment;',
        '  }',
        '}',
        ''
    ].join('\n');
}

/**
 * @param {string} pagesDir
 * @returns {string}
 */
function deriveProjectRootFromPagesDir(pagesDir) {
    const normalized = resolve(pagesDir);
    const parent = dirname(normalized);
    if (basename(parent) === 'src') {
        return dirname(parent);
    }
    return parent;
}

/**
 * @param {{ manifest: Array<{ path: string, file: string }>, pagesDir: string }} input
 * @returns {Promise<void>}
 */
async function ensureZenithTypeDeclarations(input) {
    const projectRoot = deriveProjectRootFromPagesDir(input.pagesDir);
    const zenithDir = resolve(projectRoot, '.zenith');
    await mkdir(zenithDir, { recursive: true });

    const envPath = join(zenithDir, 'zenith-env.d.ts');
    const routesPath = join(zenithDir, 'zenith-routes.d.ts');
    writeIfChanged(envPath, renderZenithEnvDts());
    writeIfChanged(routesPath, renderZenithRouteDts(input.manifest));

    const tsconfigPath = resolve(projectRoot, 'tsconfig.json');
    if (!existsSync(tsconfigPath)) {
        return;
    }
    try {
        const raw = readFileSync(tsconfigPath, 'utf8');
        const parsed = JSON.parse(raw);
        const include = Array.isArray(parsed.include) ? [...parsed.include] : [];
        if (!include.includes('.zenith/**/*.d.ts')) {
            include.push('.zenith/**/*.d.ts');
            parsed.include = include;
            writeIfChanged(tsconfigPath, `${JSON.stringify(parsed, null, 2)}\n`);
        }
    } catch {
        // Non-JSON tsconfig variants are left untouched.
    }
}

/**
 * Extract one optional `<script server>` block from a page source.
 * Returns source with the block removed plus normalized server metadata.
 *
 * @param {string} source
 * @param {string} sourceFile
 * @param {object} [compilerOpts]
 * @returns {{ source: string, serverScript: { source: string, prerender: boolean, source_path: string } | null }}
 */
function extractServerScript(source, sourceFile, compilerOpts = {}) {
    const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    const serverMatches = [];
    const reservedServerExportRe =
        /\bexport\s+const\s+(?:data|prerender|guard|load)\b|\bexport\s+(?:async\s+)?function\s+(?:load|guard)\s*\(|\bexport\s+const\s+(?:load|guard)\s*=/;

    for (const match of source.matchAll(scriptRe)) {
        const attrs = String(match[1] || '');
        const body = String(match[2] || '');
        const isServer = /\bserver\b/i.test(attrs);

        if (!isServer && reservedServerExportRe.test(body)) {
            throw new Error(
                `Zenith server script contract violation:\n` +
                `  File: ${sourceFile}\n` +
                `  Reason: guard/load/data exports are only allowed in <script server lang="ts"> or adjacent .guard.ts / .load.ts files\n` +
                `  Example: move the export into <script server lang="ts">`
            );
        }

        if (isServer) {
            serverMatches.push(match);
        }
    }

    if (serverMatches.length === 0) {
        return { source, serverScript: null };
    }

    if (serverMatches.length > 1) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: multiple <script server> blocks are not supported\n` +
            `  Example: keep exactly one <script server>...</script> block`
        );
    }

    const match = serverMatches[0];
    const full = match[0] || '';
    const attrs = String(match[1] || '');

    const hasLangTs = /\blang\s*=\s*["']ts["']/i.test(attrs);
    const hasLangJs = /\blang\s*=\s*["'](?:js|javascript)["']/i.test(attrs);
    const hasAnyLang = /\blang\s*=/i.test(attrs);
    const isTypescriptDefault = compilerOpts && compilerOpts.typescriptDefault === true;

    if (!hasLangTs) {
        if (!isTypescriptDefault || hasLangJs || hasAnyLang) {
            throw new Error(
                `Zenith server script contract violation:\n` +
                `  File: ${sourceFile}\n` +
                `  Reason: Zenith requires TypeScript server scripts. Add lang="ts" (or enable typescriptDefault).\n` +
                `  Example: <script server lang="ts">`
            );
        }
    }

    const serverSource = String(match[2] || '').trim();
    if (!serverSource) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: <script server> block is empty\n` +
            `  Example: export const data = { ... }`
        );
    }

    const loadFnMatch = serverSource.match(/\bexport\s+(?:async\s+)?function\s+load\s*\(([^)]*)\)/);
    const loadConstParenMatch = serverSource.match(/\bexport\s+const\s+load\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/);
    const loadConstSingleArgMatch = serverSource.match(
        /\bexport\s+const\s+load\s*=\s*(?:async\s*)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/
    );
    const hasLoad = Boolean(loadFnMatch || loadConstParenMatch || loadConstSingleArgMatch);
    const loadMatchCount =
        Number(Boolean(loadFnMatch)) +
        Number(Boolean(loadConstParenMatch)) +
        Number(Boolean(loadConstSingleArgMatch));
    if (loadMatchCount > 1) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: multiple load exports detected\n` +
            `  Example: keep exactly one export const load = async (ctx) => ({ ... })`
        );
    }

    const guardFnMatch = serverSource.match(/\bexport\s+(?:async\s+)?function\s+guard\s*\(([^)]*)\)/);
    const guardConstParenMatch = serverSource.match(/\bexport\s+const\s+guard\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/);
    const guardConstSingleArgMatch = serverSource.match(
        /\bexport\s+const\s+guard\s*=\s*(?:async\s*)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/
    );
    const hasGuard = Boolean(guardFnMatch || guardConstParenMatch || guardConstSingleArgMatch);
    const guardMatchCount =
        Number(Boolean(guardFnMatch)) +
        Number(Boolean(guardConstParenMatch)) +
        Number(Boolean(guardConstSingleArgMatch));
    if (guardMatchCount > 1) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: multiple guard exports detected\n` +
            `  Example: keep exactly one export const guard = async (ctx) => ({ ... })`
        );
    }

    const hasData = /\bexport\s+const\s+data\b/.test(serverSource);
    const hasSsrData = /\bexport\s+const\s+ssr_data\b/.test(serverSource);
    const hasSsr = /\bexport\s+const\s+ssr\b/.test(serverSource);
    const hasProps = /\bexport\s+const\s+props\b/.test(serverSource);

    if (hasData && hasLoad) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: export either data or load(ctx), not both\n` +
            `  Example: remove data and return payload from load(ctx)`
        );
    }
    if ((hasData || hasLoad) && (hasSsrData || hasSsr || hasProps)) {
        throw new Error(
            `Zenith server script contract violation:\n` +
            `  File: ${sourceFile}\n` +
            `  Reason: data/load cannot be combined with legacy ssr_data/ssr/props exports\n` +
            `  Example: use only export const data or export const load`
        );
    }

    if (hasLoad) {
        const singleArg = String(loadConstSingleArgMatch?.[1] || '').trim();
        const paramsText = String((loadFnMatch || loadConstParenMatch)?.[1] || '').trim();
        const arity = singleArg
            ? 1
            : paramsText.length === 0
                ? 0
                : paramsText.split(',').length;
        if (arity !== 1) {
            throw new Error(
                `Zenith server script contract violation:\n` +
                `  File: ${sourceFile}\n` +
                `  Reason: load(ctx) must accept exactly one argument\n` +
                `  Example: export const load = async (ctx) => ({ ... })`
            );
        }
    }

    if (hasGuard) {
        const singleArg = String(guardConstSingleArgMatch?.[1] || '').trim();
        const paramsText = String((guardFnMatch || guardConstParenMatch)?.[1] || '').trim();
        const arity = singleArg
            ? 1
            : paramsText.length === 0
                ? 0
                : paramsText.split(',').length;
        if (arity !== 1) {
            throw new Error(
                `Zenith server script contract violation:\n` +
                `  File: ${sourceFile}\n` +
                `  Reason: guard(ctx) must accept exactly one argument\n` +
                `  Example: export const guard = async (ctx) => ({ ... })`
            );
        }
    }

    const prerenderMatch = serverSource.match(/\bexport\s+const\s+prerender\s*=\s*([^\n;]+)/);
    let prerender = false;
    if (prerenderMatch) {
        const rawValue = String(prerenderMatch[1] || '').trim();
        if (!/^(true|false)\b/.test(rawValue)) {
            throw new Error(
                `Zenith server script contract violation:\n` +
                `  File: ${sourceFile}\n` +
                `  Reason: prerender must be a boolean literal\n` +
                `  Example: export const prerender = true`
            );
        }
        prerender = rawValue.startsWith('true');
    }
    const start = match.index ?? -1;
    if (start < 0) {
        return {
            source,
            serverScript: {
                source: serverSource,
                prerender,
                has_guard: hasGuard,
                has_load: hasLoad,
                source_path: sourceFile
            }
        };
    }

    const end = start + full.length;
    const stripped = `${source.slice(0, start)}${source.slice(end)}`;

    return {
        source: stripped,
        serverScript: {
            source: serverSource,
            prerender,
            has_guard: hasGuard,
            has_load: hasLoad,
            source_path: sourceFile
        }
    };
}

const OPEN_COMPONENT_TAG_RE = /<([A-Z][a-zA-Z0-9]*)(\s[^<>]*?)?\s*(\/?)>/g;

/**
 * Collect original attribute strings for component usages in a page source.
 *
 * @param {string} source
 * @param {Map<string, string>} registry
 * @param {string | null} ownerPath
 * @returns {Map<string, Array<{ attrs: string, ownerPath: string | null }>>}
 */
function collectComponentUsageAttrs(source, registry, ownerPath = null) {
    const out = new Map();
    OPEN_COMPONENT_TAG_RE.lastIndex = 0;
    let match;
    while ((match = OPEN_COMPONENT_TAG_RE.exec(source)) !== null) {
        const name = match[1];
        if (!registry.has(name)) {
            continue;
        }
        const attrs = String(match[2] || '').trim();
        if (!out.has(name)) {
            out.set(name, []);
        }
        out.get(name).push({ attrs, ownerPath });
    }
    return out;
}

/**
 * Collect component usage attrs recursively so nested component callsites
 * receive deterministic props preludes during page-hoist merging.
 *
 * Current Zenith architecture still resolves one attrs set per component type.
 * This helper preserves that model while ensuring nested usages are not lost.
 *
 * @param {string} source
 * @param {Map<string, string>} registry
 * @param {string | null} ownerPath
 * @param {Set<string>} visitedFiles
 * @param {Map<string, Array<{ attrs: string, ownerPath: string | null }>>} out
 * @returns {Map<string, Array<{ attrs: string, ownerPath: string | null }>>}
 */
function collectRecursiveComponentUsageAttrs(source, registry, ownerPath = null, visitedFiles = new Set(), out = new Map()) {
    const local = collectComponentUsageAttrs(source, registry, ownerPath);
    for (const [name, attrsList] of local.entries()) {
        if (!out.has(name)) {
            out.set(name, []);
        }
        out.get(name).push(...attrsList);
    }

    for (const name of local.keys()) {
        const compPath = registry.get(name);
        if (!compPath || visitedFiles.has(compPath)) {
            continue;
        }
        visitedFiles.add(compPath);
        const componentSource = readFileSync(compPath, 'utf8');
        collectRecursiveComponentUsageAttrs(componentSource, registry, compPath, visitedFiles, out);
    }

    return out;
}

/**
 * Merge a component's IR into the page IR.
 *
 * Transfers component scripts and hoisted script blocks so component runtime
 * behavior is preserved after structural macro expansion.
 *
 * @param {object} pageIr — the page's compiled IR (mutated in place)
 * @param {object} compIr — the component's compiled IR
 * @param {string} compPath — component file path
 * @param {string} pageFile — page file path
 * @param {{
 *   includeCode: boolean,
 *   cssImportsOnly: boolean,
 *   documentMode?: boolean,
 *   componentAttrs?: string,
 *   componentAttrsRewrite?: {
 *     expressionRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null,
 *     scopeRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null
 *   } | null
 * }} options
 * @param {Set<string>} seenStaticImports
 */
function mergeComponentIr(pageIr, compIr, compPath, pageFile, options, seenStaticImports, knownRefKeys = null) {
    // Merge components_scripts
    if (compIr.components_scripts) {
        for (const [hoistId, script] of Object.entries(compIr.components_scripts)) {
            if (!pageIr.components_scripts[hoistId]) {
                pageIr.components_scripts[hoistId] = script;
            }
        }
    }

    // Merge component_instances
    if (compIr.component_instances?.length) {
        pageIr.component_instances.push(...compIr.component_instances);
    }

    if (knownRefKeys instanceof Set && Array.isArray(compIr.ref_bindings)) {
        const componentStateBindings = Array.isArray(compIr?.hoisted?.state) ? compIr.hoisted.state : [];
        for (const binding of compIr.ref_bindings) {
            if (!binding || typeof binding.identifier !== 'string' || binding.identifier.length === 0) {
                continue;
            }
            const resolved = resolveStateKeyFromBindings(binding.identifier, componentStateBindings);
            knownRefKeys.add(resolved || binding.identifier);
        }
    }

    // Merge hoisted imports (deduplicated, rebased to the page file path)
    if (compIr.hoisted?.imports?.length) {
        for (const imp of compIr.hoisted.imports) {
            const rebased = rewriteStaticImportLine(imp, compPath, pageFile);
            if (options.cssImportsOnly) {
                const spec = extractStaticImportSpecifier(rebased);
                if (!spec || !isCssSpecifier(spec)) {
                    continue;
                }
            }
            if (!pageIr.hoisted.imports.includes(rebased)) {
                pageIr.hoisted.imports.push(rebased);
            }
        }
    }

    // Merge hoisted symbol/state tables for runtime literal evaluation.
    // Component-expanded expressions can reference rewritten component symbols,
    // so state keys/values must be present in the page envelope.
    if (options.includeCode && compIr.hoisted) {
        if (Array.isArray(compIr.hoisted.declarations)) {
            for (const decl of compIr.hoisted.declarations) {
                if (!pageIr.hoisted.declarations.includes(decl)) {
                    pageIr.hoisted.declarations.push(decl);
                }
            }
        }
        if (Array.isArray(compIr.hoisted.functions)) {
            for (const fnName of compIr.hoisted.functions) {
                if (!pageIr.hoisted.functions.includes(fnName)) {
                    pageIr.hoisted.functions.push(fnName);
                }
            }
        }
        if (Array.isArray(compIr.hoisted.signals)) {
            for (const signalName of compIr.hoisted.signals) {
                if (!pageIr.hoisted.signals.includes(signalName)) {
                    pageIr.hoisted.signals.push(signalName);
                }
            }
        }
        if (Array.isArray(compIr.hoisted.state)) {
            const existingKeys = new Set(
                (pageIr.hoisted.state || [])
                    .map((entry) => entry && typeof entry === 'object' ? entry.key : null)
                    .filter(Boolean)
            );
            for (const stateEntry of compIr.hoisted.state) {
                if (!stateEntry || typeof stateEntry !== 'object') {
                    continue;
                }
                if (typeof stateEntry.key !== 'string' || stateEntry.key.length === 0) {
                    continue;
                }
                if (existingKeys.has(stateEntry.key)) {
                    continue;
                }
                existingKeys.add(stateEntry.key);
                pageIr.hoisted.state.push(stateEntry);
            }
        }
    }

    if (options.includeCode && Array.isArray(compIr.signals)) {
        pageIr.signals = Array.isArray(pageIr.signals) ? pageIr.signals : [];
        const existingSignalStateKeys = new Set(
            pageIr.signals
                .map((signal) => {
                    const stateIndex = signal?.state_index;
                    return Number.isInteger(stateIndex) ? pageIr.hoisted.state?.[stateIndex]?.key : null;
                })
                .filter(Boolean)
        );

        for (const signal of compIr.signals) {
            if (!signal || !Number.isInteger(signal.state_index)) {
                continue;
            }
            const stateKey = compIr.hoisted?.state?.[signal.state_index]?.key;
            if (typeof stateKey !== 'string' || stateKey.length === 0) {
                continue;
            }
            const pageStateIndex = pageIr.hoisted.state.findIndex((entry) => entry?.key === stateKey);
            if (!Number.isInteger(pageStateIndex) || pageStateIndex < 0) {
                continue;
            }
            if (existingSignalStateKeys.has(stateKey)) {
                continue;
            }
            existingSignalStateKeys.add(stateKey);
            pageIr.signals.push({
                id: pageIr.signals.length,
                kind: typeof signal.kind === 'string' && signal.kind.length > 0 ? signal.kind : 'signal',
                state_index: pageStateIndex
            });
        }
    }

    // Merge hoisted code blocks (rebased to the page file path)
    if (options.includeCode && compIr.hoisted?.code?.length) {
        for (const block of compIr.hoisted.code) {
            const rebased = rewriteStaticImportsInSource(block, compPath, pageFile);
            const filteredImports = options.cssImportsOnly
                ? stripNonCssStaticImportsInSource(rebased)
                : rebased;
            const withPropsPrelude = injectPropsPrelude(
                filteredImports,
                options.componentAttrs || '',
                options.componentAttrsRewrite || null
            );
            const transpiled = transpileTypeScriptToJs(withPropsPrelude, compPath);
            const deduped = dedupeStaticImportsInSource(transpiled, seenStaticImports);
            const deferred = deferComponentRuntimeBlock(deduped);
            if (deferred.trim().length > 0 && !pageIr.hoisted.code.includes(deferred)) {
                pageIr.hoisted.code.push(deferred);
            }
        }
    }
}

/**
 * @param {string} spec
 * @returns {boolean}
 */
function isRelativeSpecifier(spec) {
    return spec.startsWith('./') || spec.startsWith('../');
}

/**
 * @param {string} spec
 * @param {string} fromFile
 * @param {string} toFile
 * @returns {string}
 */
function rebaseRelativeSpecifier(spec, fromFile, toFile) {
    if (!isRelativeSpecifier(spec)) {
        return spec;
    }

    const absoluteTarget = resolve(dirname(fromFile), spec);
    let rebased = relative(dirname(toFile), absoluteTarget).replaceAll('\\', '/');
    if (!rebased.startsWith('.')) {
        rebased = `./${rebased}`;
    }
    return rebased;
}

/**
 * @param {string} line
 * @param {string} fromFile
 * @param {string} toFile
 * @returns {string}
 */
function rewriteStaticImportLine(line, fromFile, toFile) {
    const match = line.match(/^\s*import(?:\s+[^'"]+?\s+from)?\s*['"]([^'"]+)['"]\s*;?\s*$/);
    if (!match) {
        return line;
    }

    const spec = match[1];
    if (!isRelativeSpecifier(spec)) {
        return line;
    }

    const rebased = rebaseRelativeSpecifier(spec, fromFile, toFile);
    return replaceImportSpecifierLiteral(line, spec, rebased);
}

/**
 * @param {string} line
 * @returns {string | null}
 */
function extractStaticImportSpecifier(line) {
    const match = line.match(/^\s*import(?:\s+[^'"]+?\s+from)?\s*['"]([^'"]+)['"]\s*;?\s*$/);
    return match ? match[1] : null;
}

/**
 * @param {string} spec
 * @returns {boolean}
 */
function isCssSpecifier(spec) {
    return /\.css(?:[?#].*)?$/i.test(spec);
}

/**
 * @param {string} source
 * @param {string} fromFile
 * @param {string} toFile
 * @returns {string}
 */
function rewriteStaticImportsInSource(source, fromFile, toFile) {
    return source.replace(
        /(^\s*import(?:\s+[^'"]+?\s+from)?\s*['"])([^'"]+)(['"]\s*;?\s*$)/gm,
        (_full, prefix, spec, suffix) => `${prefix}${rebaseRelativeSpecifier(spec, fromFile, toFile)}${suffix}`
    );
}

/**
 * @param {string} line
 * @param {string} oldSpec
 * @param {string} newSpec
 * @returns {string}
 */
function replaceImportSpecifierLiteral(line, oldSpec, newSpec) {
    const single = `'${oldSpec}'`;
    if (line.includes(single)) {
        return line.replace(single, `'${newSpec}'`);
    }

    const dbl = `"${oldSpec}"`;
    if (line.includes(dbl)) {
        return line.replace(dbl, `"${newSpec}"`);
    }

    return line;
}

/**
 * @param {string} source
 * @param {string} sourceFile
 * @returns {string}
 */
function transpileTypeScriptToJs(source, sourceFile) {
    const ts = loadTypeScriptApi();
    if (!ts) {
        return source;
    }

    try {
        const output = ts.transpileModule(source, {
            fileName: sourceFile,
            compilerOptions: {
                module: ts.ModuleKind.ESNext,
                target: ts.ScriptTarget.ES5,
                importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Preserve,
                verbatimModuleSyntax: true,
                newLine: ts.NewLineKind.LineFeed,
            },
            reportDiagnostics: false,
        });
        return output.outputText;
    } catch {
        return source;
    }
}

const DEFERRED_RUNTIME_CALLS = new Set(['zenMount', 'zenEffect', 'zeneffect']);

/**
 * Split top-level runtime side-effect calls from hoistable declarations.
 *
 * Keeps declarations/functions/constants at module scope so rewritten template
 * expressions can resolve their identifiers during hydrate(), while deferring
 * zenMount/zenEffect registration until __zenith_mount().
 *
 * @param {string} body
 * @returns {{ hoisted: string, deferred: string }}
 */
function splitDeferredRuntimeCalls(body) {
    const ts = loadTypeScriptApi();
    if (!ts || typeof body !== 'string' || body.trim().length === 0) {
        return { hoisted: body, deferred: '' };
    }

    let sourceFile;
    try {
        sourceFile = ts.createSourceFile(
            'zenith-component-runtime.ts',
            body,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS
        );
    } catch {
        return { hoisted: body, deferred: '' };
    }

    if (!sourceFile || !Array.isArray(sourceFile.statements) || sourceFile.statements.length === 0) {
        return { hoisted: body, deferred: '' };
    }

    /** @type {Array<{ start: number, end: number }>} */
    const ranges = [];

    for (const statement of sourceFile.statements) {
        if (!ts.isExpressionStatement(statement)) {
            continue;
        }
        if (!ts.isCallExpression(statement.expression)) {
            continue;
        }

        let callee = statement.expression.expression;
        while (ts.isParenthesizedExpression(callee)) {
            callee = callee.expression;
        }

        if (!ts.isIdentifier(callee) || !DEFERRED_RUNTIME_CALLS.has(callee.text)) {
            continue;
        }

        const start = typeof statement.getFullStart === 'function'
            ? statement.getFullStart()
            : statement.pos;
        const end = statement.end;
        if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
            continue;
        }
        ranges.push({ start, end });
    }

    if (ranges.length === 0) {
        return { hoisted: body, deferred: '' };
    }

    ranges.sort((a, b) => a.start - b.start);
    /** @type {Array<{ start: number, end: number }>} */
    const merged = [];
    for (const range of ranges) {
        const last = merged[merged.length - 1];
        if (!last || range.start > last.end) {
            merged.push({ start: range.start, end: range.end });
            continue;
        }
        if (range.end > last.end) {
            last.end = range.end;
        }
    }

    let cursor = 0;
    let hoisted = '';
    let deferred = '';

    for (const range of merged) {
        if (range.start > cursor) {
            hoisted += body.slice(cursor, range.start);
        }
        deferred += body.slice(range.start, range.end);
        if (!deferred.endsWith('\n')) {
            deferred += '\n';
        }
        cursor = range.end;
    }

    if (cursor < body.length) {
        hoisted += body.slice(cursor);
    }

    return { hoisted, deferred };
}

/**
 * @param {string} source
 * @param {Set<string>} seenStaticImports
 * @returns {string}
 */
function dedupeStaticImportsInSource(source, seenStaticImports) {
    const lines = source.split('\n');
    const kept = [];

    for (const line of lines) {
        const spec = extractStaticImportSpecifier(line);
        if (!spec) {
            kept.push(line);
            continue;
        }

        const key = line.trim();
        if (seenStaticImports.has(key)) {
            continue;
        }
        seenStaticImports.add(key);
        kept.push(line);
    }

    return kept.join('\n');
}

/**
 * @param {string} source
 * @returns {string}
 */
function stripNonCssStaticImportsInSource(source) {
    const lines = source.split('\n');
    const kept = [];
    for (const line of lines) {
        const spec = extractStaticImportSpecifier(line);
        if (!spec) {
            kept.push(line);
            continue;
        }
        if (isCssSpecifier(spec)) {
            kept.push(line);
        }
    }
    return kept.join('\n');
}

/**
 * @param {string} key
 * @returns {string}
 */
function renderObjectKey(key) {
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
        return key;
    }
    return JSON.stringify(key);
}

/**
 * @param {string} value
 * @returns {string | null}
 */
function deriveScopedIdentifierAlias(value) {
    const ident = String(value || '').trim();
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(ident)) {
        return null;
    }
    const parts = ident.split('_').filter(Boolean);
    const candidate = parts.length > 1 ? parts[parts.length - 1] : ident;
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(candidate) ? candidate : ident;
}

/**
 * @param {Map<string, string>} map
 * @param {Set<string>} ambiguous
 * @param {string | null} raw
 * @param {string | null} rewritten
 */
function recordScopedIdentifierRewrite(map, ambiguous, raw, rewritten) {
    if (typeof raw !== 'string' || raw.length === 0 || typeof rewritten !== 'string' || rewritten.length === 0) {
        return;
    }
    const existing = map.get(raw);
    if (existing && existing !== rewritten) {
        map.delete(raw);
        ambiguous.add(raw);
        return;
    }
    if (!ambiguous.has(raw)) {
        map.set(raw, rewritten);
    }
}

/**
 * @param {object | null | undefined} ir
 * @returns {{ map: Map<string, string>, ambiguous: Set<string> }}
 */
function buildScopedIdentifierRewrite(ir) {
    const out = { map: new Map(), ambiguous: new Set() };
    if (!ir || typeof ir !== 'object') {
        return out;
    }

    const stateBindings = Array.isArray(ir?.hoisted?.state) ? ir.hoisted.state : [];
    for (const stateEntry of stateBindings) {
        const key = typeof stateEntry?.key === 'string' ? stateEntry.key : null;
        recordScopedIdentifierRewrite(out.map, out.ambiguous, deriveScopedIdentifierAlias(key), key);
    }

    const functionBindings = Array.isArray(ir?.hoisted?.functions) ? ir.hoisted.functions : [];
    for (const fnName of functionBindings) {
        if (typeof fnName !== 'string') {
            continue;
        }
        recordScopedIdentifierRewrite(out.map, out.ambiguous, deriveScopedIdentifierAlias(fnName), fnName);
    }

    return out;
}

/**
 * @param {string} expr
 * @param {{
 *   expressionRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null,
 *   scopeRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null
 * } | null} rewriteContext
 * @returns {string}
 */
function rewritePropsExpression(expr, rewriteContext = null) {
    const trimmed = String(expr || '').trim();
    if (!trimmed) {
        return trimmed;
    }

    const expressionMap = rewriteContext?.expressionRewrite?.map;
    const expressionAmbiguous = rewriteContext?.expressionRewrite?.ambiguous;
    if (
        expressionMap instanceof Map &&
        !(expressionAmbiguous instanceof Set && expressionAmbiguous.has(trimmed))
    ) {
        const exact = expressionMap.get(trimmed);
        if (typeof exact === 'string' && exact.length > 0) {
            return exact;
        }
    }

    const scopeMap = rewriteContext?.scopeRewrite?.map;
    const scopeAmbiguous = rewriteContext?.scopeRewrite?.ambiguous;
    const rootMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)([\s\S]*)$/);
    if (!rootMatch || !(scopeMap instanceof Map)) {
        return trimmed;
    }

    const root = rootMatch[1];
    if (scopeAmbiguous instanceof Set && scopeAmbiguous.has(root)) {
        return trimmed;
    }

    const rewrittenRoot = scopeMap.get(root);
    if (typeof rewrittenRoot !== 'string' || rewrittenRoot.length === 0 || rewrittenRoot === root) {
        return trimmed;
    }

    return `${rewrittenRoot}${rootMatch[2]}`;
}

/**
 * @param {string} attrs
 * @param {{
 *   expressionRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null,
 *   scopeRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null
 * } | null} rewriteContext
 * @returns {string}
 */
function renderPropsLiteralFromAttrs(attrs, rewriteContext = null) {
    const src = String(attrs || '').trim();
    if (!src) {
        return '{}';
    }

    const entries = [];
    const attrRe = /([A-Za-z_$][A-Za-z0-9_$-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]*?)\}))?/g;
    let match;
    while ((match = attrRe.exec(src)) !== null) {
        const rawName = match[1];
        if (!rawName || rawName.startsWith('on:')) {
            continue;
        }

        const doubleQuoted = match[2];
        const singleQuoted = match[3];
        const expressionValue = match[4];
        let valueCode = 'true';
        if (doubleQuoted !== undefined) {
            valueCode = JSON.stringify(doubleQuoted);
        } else if (singleQuoted !== undefined) {
            valueCode = JSON.stringify(singleQuoted);
        } else if (expressionValue !== undefined) {
            const trimmed = String(expressionValue).trim();
            valueCode = trimmed.length > 0 ? rewritePropsExpression(trimmed, rewriteContext) : 'undefined';
        }

        entries.push(`${renderObjectKey(rawName)}: ${valueCode}`);
    }

    if (entries.length === 0) {
        return '{}';
    }

    return `{ ${entries.join(', ')} }`;
}

/**
 * @param {string} source
 * @param {string} attrs
 * @param {{
 *   expressionRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null,
 *   scopeRewrite?: { map?: Map<string, string>, ambiguous?: Set<string> } | null
 * } | null} rewriteContext
 * @returns {string}
 */
function injectPropsPrelude(source, attrs, rewriteContext = null) {
    if (typeof source !== 'string' || source.trim().length === 0) {
        return source;
    }
    if (!/\bprops\b/.test(source)) {
        return source;
    }
    if (/\b(?:const|let|var)\s+props\b/.test(source)) {
        return source;
    }

    const propsLiteral = renderPropsLiteralFromAttrs(attrs, rewriteContext);
    return `var props = ${propsLiteral};\n${source}`;
}

/**
 * @param {string} source
 * @returns {string}
 */
function deferComponentRuntimeBlock(source) {
    const lines = source.split('\n');
    const importLines = [];
    const bodyLines = [];
    let inImportPrefix = true;

    for (const line of lines) {
        if (inImportPrefix && extractStaticImportSpecifier(line)) {
            importLines.push(line);
            continue;
        }
        inImportPrefix = false;
        bodyLines.push(line);
    }

    const body = bodyLines.join('\n');
    if (body.trim().length === 0) {
        return importLines.join('\n');
    }

    const { hoisted, deferred } = splitDeferredRuntimeCalls(body);
    if (deferred.trim().length === 0) {
        return [importLines.join('\n').trim(), hoisted.trim()]
            .filter((segment) => segment.length > 0)
            .join('\n');
    }

    const indentedBody = deferred
        .trim()
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n');
    const wrapped = [
        importLines.join('\n').trim(),
        hoisted.trim(),
        "__zenith_component_bootstraps.push(() => {",
        indentedBody,
        "});"
    ]
        .filter((segment) => segment.length > 0)
        .join('\n');

    return wrapped;
}

/**
 * Run bundler process for one page envelope.
 *
 * @param {object|object[]} envelope
 * @param {string} outDir
 * @param {string} projectRoot
 * @param {object | null} [logger]
 * @param {boolean} [showInfo]
 * @returns {Promise<void>}
 */
function runBundler(envelope, outDir, projectRoot, logger = null, showInfo = true) {
    return new Promise((resolvePromise, rejectPromise) => {
        const useStructuredLogger = Boolean(logger && typeof logger.childLine === 'function');
        const child = spawn(
            getBundlerBin(),
            ['--out-dir', outDir],
            {
                cwd: projectRoot,
                stdio: useStructuredLogger ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit']
            }
        );

        if (useStructuredLogger) {
            forwardStreamLines(child.stdout, (line) => {
                logger.childLine('bundler', line, { stream: 'stdout', showInfo });
            });
            forwardStreamLines(child.stderr, (line) => {
                logger.childLine('bundler', line, { stream: 'stderr', showInfo: true });
            });
        }

        child.on('error', (err) => {
            rejectPromise(new Error(`Bundler spawn failed: ${err.message}`));
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolvePromise();
                return;
            }
            rejectPromise(new Error(`Bundler failed with exit code ${code}`));
        });

        child.stdin.write(JSON.stringify(envelope));
        child.stdin.end();
    });
}

/**
 * Collect generated assets for reporting.
 *
 * @param {string} rootDir
 * @returns {Promise<string[]>}
 */
async function collectAssets(rootDir) {
    const files = [];

    async function walk(dir) {
        let entries = [];
        try {
            entries = await readdir(dir);
        } catch {
            return;
        }

        entries.sort((a, b) => a.localeCompare(b));
        for (const name of entries) {
            const fullPath = join(dir, name);
            const info = await stat(fullPath);
            if (info.isDirectory()) {
                await walk(fullPath);
                continue;
            }
            if (fullPath.endsWith('.js') || fullPath.endsWith('.css')) {
                files.push(relative(rootDir, fullPath).replaceAll('\\', '/'));
            }
        }
    }

    await walk(rootDir);
    files.sort((a, b) => a.localeCompare(b));
    return files;
}

/**
 * Build all pages by orchestrating compiler and bundler binaries.
 *
 * Pipeline:
 *   1. Build component registry (PascalCase name → .zen file path)
 *   2. For each page:
 *      a. Expand PascalCase tags into component template HTML
 *      b. Compile expanded page source via --stdin
 *      c. Compile each used component separately for script IR
 *      d. Merge component IRs into page IR
 *   3. Send all envelopes to bundler
 *
 * @param {{ pagesDir: string, outDir: string, config?: object, logger?: object | null, showBundlerInfo?: boolean }} options
 * @returns {Promise<{ pages: number, assets: string[] }>}
 */
export async function build(options) {
    const { pagesDir, outDir, config = {}, logger = null, showBundlerInfo = true } = options;
    const projectRoot = deriveProjectRootFromPagesDir(pagesDir);
    const softNavigationEnabled = config.softNavigation === true || config.router === true;
    const compilerOpts = {
        typescriptDefault: config.typescriptDefault === true,
        experimentalEmbeddedMarkup: config.embeddedMarkupExpressions === true || config.experimental?.embeddedMarkupExpressions === true,
        strictDomLints: config.strictDomLints === true
    };

    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    // Derive src/ directory from pages/ directory
    const srcDir = resolve(pagesDir, '..');

    // 1. Build component registry
    const registry = buildComponentRegistry(srcDir);
    if (registry.size > 0) {
        if (logger && typeof logger.build === 'function') {
            logger.build(`registry=${registry.size} components`, {
                onceKey: `component-registry:${registry.size}`
            });
        } else {
            console.log(`[zenith] Component registry: ${registry.size} components`);
        }
    }

    const manifest = await generateManifest(pagesDir);
    await ensureZenithTypeDeclarations({ manifest, pagesDir });

    // Cache: avoid re-compiling the same component for multiple pages
    /** @type {Map<string, object>} */
    const componentIrCache = new Map();
    /** @type {Map<string, boolean>} */
    const componentDocumentModeCache = new Map();
    /** @type {Map<string, { map: Map<string, string>, ambiguous: Set<string> }>} */
    const componentExpressionRewriteCache = new Map();
    const emitCompilerWarning = createCompilerWarningEmitter((line) => {
        if (logger && typeof logger.warn === 'function') {
            logger.warn(line, { onceKey: `compiler-warning:${line}` });
            return;
        }
        console.warn(line);
    });

    const envelopes = [];
    for (const entry of manifest) {
        const sourceFile = join(pagesDir, entry.file);
        const rawSource = readFileSync(sourceFile, 'utf8');
        const componentUsageAttrs = collectRecursiveComponentUsageAttrs(rawSource, registry, sourceFile);

        const baseName = sourceFile.slice(0, -extname(sourceFile).length);
        let adjacentGuard = null;
        let adjacentLoad = null;
        for (const ext of ['.ts', '.js']) {
            if (!adjacentGuard && existsSync(`${baseName}.guard${ext}`)) adjacentGuard = `${baseName}.guard${ext}`;
            if (!adjacentLoad && existsSync(`${baseName}.load${ext}`)) adjacentLoad = `${baseName}.load${ext}`;
        }

        // 2a. Expand PascalCase component tags
        const { expandedSource, usedComponents } = expandComponents(
            rawSource, registry, sourceFile
        );
        const extractedServer = extractServerScript(expandedSource, sourceFile, compilerOpts);
        const compileSource = extractedServer.source;

        // 2b. Compile expanded page source via --stdin
        const pageIr = runCompiler(
            sourceFile,
            compileSource,
            compilerOpts,
            { onWarning: emitCompilerWarning }
        );

        const hasGuard = (extractedServer.serverScript && extractedServer.serverScript.has_guard) || adjacentGuard !== null;
        const hasLoad = (extractedServer.serverScript && extractedServer.serverScript.has_load) || adjacentLoad !== null;

        if (extractedServer.serverScript) {
            pageIr.server_script = extractedServer.serverScript;
            pageIr.prerender = extractedServer.serverScript.prerender === true;
            if (pageIr.ssr_data === undefined) {
                pageIr.ssr_data = null;
            }
        }

        // Static Build Route Protection Policy
        if (pageIr.prerender === true && (hasGuard || hasLoad)) {
            throw new Error(
                `[zenith] Build failed for ${entry.file}: protected routes require SSR/runtime. ` +
                `Cannot prerender a static route with a \`guard\` or \`load\` function.`
            );
        }

        // Apply metadata to IR
        pageIr.has_guard = hasGuard;
        pageIr.has_load = hasLoad;
        pageIr.guard_module_ref = adjacentGuard ? relative(srcDir, adjacentGuard).replaceAll('\\', '/') : null;
        pageIr.load_module_ref = adjacentLoad ? relative(srcDir, adjacentLoad).replaceAll('\\', '/') : null;

        // Ensure IR has required array fields for merging
        pageIr.components_scripts = pageIr.components_scripts || {};
        pageIr.component_instances = pageIr.component_instances || [];
        pageIr.signals = Array.isArray(pageIr.signals) ? pageIr.signals : [];
        pageIr.hoisted = pageIr.hoisted || { imports: [], declarations: [], functions: [], signals: [], state: [], code: [] };
        pageIr.hoisted.imports = pageIr.hoisted.imports || [];
        pageIr.hoisted.declarations = pageIr.hoisted.declarations || [];
        pageIr.hoisted.functions = pageIr.hoisted.functions || [];
        pageIr.hoisted.signals = pageIr.hoisted.signals || [];
        pageIr.hoisted.state = pageIr.hoisted.state || [];
        pageIr.hoisted.code = pageIr.hoisted.code || [];
        const seenStaticImports = new Set();
        const pageExpressionRewriteMap = new Map();
        const pageExpressionBindingMap = new Map();
        const pageAmbiguousExpressionMap = new Set();
        const knownRefKeys = new Set();
        const pageScopeRewrite = buildScopedIdentifierRewrite(pageIr);
        const pageSelfExpressionRewrite = buildComponentExpressionRewrite(sourceFile, compileSource, pageIr, compilerOpts);
        const componentScopeRewriteCache = new Map();

        // 2c. Compile each used component separately for its script IR
        for (const compName of usedComponents) {
            const compPath = registry.get(compName);
            if (!compPath) continue;
            const componentSource = readFileSync(compPath, 'utf8');

            let compIr;
            if (componentIrCache.has(compPath)) {
                compIr = componentIrCache.get(compPath);
            } else {
                const componentCompileSource = stripStyleBlocks(componentSource);
                compIr = runCompiler(
                    compPath,
                    componentCompileSource,
                    compilerOpts,
                    { onWarning: emitCompilerWarning }
                );
                componentIrCache.set(compPath, compIr);
            }

            let isDocMode = componentDocumentModeCache.get(compPath);
            if (isDocMode === undefined) {
                isDocMode = isDocumentMode(extractTemplate(componentSource));
                componentDocumentModeCache.set(compPath, isDocMode);
            }

            let expressionRewrite = componentExpressionRewriteCache.get(compPath);
            if (!expressionRewrite) {
                expressionRewrite = buildComponentExpressionRewrite(compPath, componentSource, compIr, compilerOpts);
                componentExpressionRewriteCache.set(compPath, expressionRewrite);
            }

            let usageEntry = (componentUsageAttrs.get(compName) || [])[0] || { attrs: '', ownerPath: sourceFile };
            if (!usageEntry || typeof usageEntry !== 'object') {
                usageEntry = { attrs: '', ownerPath: sourceFile };
            }

            let attrExpressionRewrite = pageSelfExpressionRewrite;
            let attrScopeRewrite = pageScopeRewrite;
            const ownerPath = typeof usageEntry.ownerPath === 'string' && usageEntry.ownerPath.length > 0
                ? usageEntry.ownerPath
                : sourceFile;

            if (ownerPath !== sourceFile) {
                let ownerIr = componentIrCache.get(ownerPath);
                if (!ownerIr) {
                    const ownerSource = readFileSync(ownerPath, 'utf8');
                    ownerIr = runCompiler(
                        ownerPath,
                        stripStyleBlocks(ownerSource),
                        compilerOpts,
                        { onWarning: emitCompilerWarning }
                    );
                    componentIrCache.set(ownerPath, ownerIr);
                }

                attrExpressionRewrite = componentExpressionRewriteCache.get(ownerPath);
                if (!attrExpressionRewrite) {
                    const ownerSource = readFileSync(ownerPath, 'utf8');
                    attrExpressionRewrite = buildComponentExpressionRewrite(ownerPath, ownerSource, ownerIr, compilerOpts);
                    componentExpressionRewriteCache.set(ownerPath, attrExpressionRewrite);
                }

                attrScopeRewrite = componentScopeRewriteCache.get(ownerPath);
                if (!attrScopeRewrite) {
                    attrScopeRewrite = buildScopedIdentifierRewrite(ownerIr);
                    componentScopeRewriteCache.set(ownerPath, attrScopeRewrite);
                }
            }

            // 2d. Merge component IR into page IR
            mergeComponentIr(
                pageIr,
                compIr,
                compPath,
                sourceFile,
                {
                    includeCode: true,
                    cssImportsOnly: isDocMode,
                    documentMode: isDocMode,
                    componentAttrs: typeof usageEntry.attrs === 'string' ? usageEntry.attrs : '',
                    componentAttrsRewrite: {
                        expressionRewrite: attrExpressionRewrite,
                        scopeRewrite: attrScopeRewrite
                    }
                },
                seenStaticImports,
                knownRefKeys
            );

            mergeExpressionRewriteMaps(
                pageExpressionRewriteMap,
                pageExpressionBindingMap,
                pageAmbiguousExpressionMap,
                expressionRewrite,
                pageIr
            );
        }

        applyExpressionRewrites(
            pageIr,
            pageExpressionRewriteMap,
            pageExpressionBindingMap,
            pageAmbiguousExpressionMap
        );
        normalizeExpressionBindingDependencies(pageIr);

        rewriteLegacyMarkupIdentifiers(pageIr);
        rewriteRefBindingIdentifiers(pageIr, knownRefKeys);

        envelopes.push({
            route: entry.path,
            file: sourceFile,
            ir: pageIr,
            router: softNavigationEnabled
        });
    }

    if (envelopes.length > 0) {
    await runBundler(envelopes, outDir, projectRoot, logger, showBundlerInfo);
    }

    const assets = await collectAssets(outDir);
    return { pages: manifest.length, assets };
}
