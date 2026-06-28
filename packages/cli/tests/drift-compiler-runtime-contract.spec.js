import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from './helpers/drift-gates-fixtures.js';

describe('drift compiler/runtime contract', () => {
    test('compiler→runtime naming contract uses fragment and removes legacy zenhtml plumbing', () => {
        const hydrateSource = readFileSync(
            resolve(REPO_ROOT, 'packages/runtime/src/hydrate.js'),
            'utf8'
        );
        const expressionsSource = readFileSync(
            resolve(REPO_ROOT, 'packages/runtime/src/expressions.js'),
            'utf8'
        );
        expect(hydrateSource).not.toContain('__ZENITH_INTERNAL_ZENHTML');
        expect(expressionsSource).toContain('fragment: _fragment');

        const buildSource = readFileSync(
            resolve(REPO_ROOT, 'packages/cli/src/build/page-ir-normalization.js'),
            'utf8'
        );
        expect(buildSource).toContain('markup syntax is unsupported');
        expect(buildSource).not.toContain('__ZENITH_INTERNAL_ZENHTML');
        expect(buildSource).not.toContain('normalizeFragmentHelperCalls');
        expect(buildSource).not.toContain('synthesizeSignalBackedCompiledExpressions');
        expect(buildSource).not.toContain('normalizeExpressionBindingDependencies');
        expect(buildSource).not.toContain('applyScopedIdentifierRewrites');

        const pageLoopSource = readFileSync(
            resolve(REPO_ROOT, 'packages/cli/src/build/page-loop.js'),
            'utf8'
        );
        expect(pageLoopSource).not.toContain('synthesizeSignalBackedCompiledExpressions');
        expect(pageLoopSource).not.toContain('normalizeExpressionBindingDependencies');
        expect(pageLoopSource).not.toContain('buildScopedIdentifierRewrite');
        expect(pageLoopSource).not.toContain('applyScopedIdentifierRewrites');

        const scopedRewriteSource = readFileSync(
            resolve(REPO_ROOT, 'packages/cli/src/build/scoped-identifier-rewrite.js'),
            'utf8'
        );
        expect(scopedRewriteSource).not.toContain('scopeRewrite');
        expect(scopedRewriteSource).not.toContain('rewriteIdentifiersWithinExpression');
        expect(scopedRewriteSource).not.toContain('deriveScopedIdentifierAlias');

        const bundlerMainSource = readFileSync(
            resolve(REPO_ROOT, 'packages/bundler/src/main.rs'),
            'utf8'
        );
        expect(bundlerMainSource).not.toContain('const __zenith_fragment = __ctx.fragment');
        expect(bundlerMainSource).not.toContain('const fragment = __ctx.fragment');

        const bundlerUtilsSource = readFileSync(
            resolve(REPO_ROOT, 'packages/bundler/src/utils.rs'),
            'utf8'
        );
        expect(bundlerUtilsSource).toContain('serialize_js_string_literal');
        expect(bundlerUtilsSource).toContain('serialize_js_template_literal');
        expect(bundlerUtilsSource).not.toContain('pub fn escape_js_template_literal');
        expect(bundlerUtilsSource).not.toContain('pub fn escape_js_string');
    });
});
