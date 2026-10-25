import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { forwardComponentScript, mergeComponentIr } from '../src/build/merge-component-ir.js';

function resolveBin(envName, releasePath, debugPath) {
    if (process.env[envName]) {
        return process.env[envName];
    }
    if (existsSync(releasePath)) {
        return releasePath;
    }
    if (existsSync(debugPath)) {
        return debugPath;
    }
    return debugPath;
}

const here = fileURLToPath(new URL('.', import.meta.url));
const compilerBin = resolveBin(
    'ZENITH_COMPILER_BIN',
    join(here, '../../compiler/target/release/zenith-compiler'),
    join(here, '../../compiler/target/debug/zenith-compiler')
);
const bundlerBin = resolveBin(
    'ZENITH_BUNDLER_BIN',
    join(here, '../../bundler/target/release/zenith-bundler'),
    join(here, '../../bundler/target/debug/zenith-bundler')
);

function graphHash(hoistIds) {
    const ids = [...hoistIds].sort();
    const seed = ids.map((id) => `id:${id}\n`).join('');
    return createHash('sha256').update(seed).digest('hex');
}

function componentScriptModuleId(sourcePath, scriptIndex) {
    return `${String(sourcePath).replace(/\\/g, '/')}:script${scriptIndex}`;
}

function assertForward() {
    const moduleId = componentScriptModuleId('src/components/Card.zen', 0);
    const script = {
        hoist_id: 'comp_hoist',
        module_id: moduleId,
        factory: 'createComponent_comp_hoist',
        imports: ["import helper from './helper.js';"],
        deps: [],
        code: 'export function createComponent_comp_hoist(){ return { mount(){}, update(){}, destroy(){}, bindings:Object.freeze({}) }; }'
    };
    assert.equal(forwardComponentScript(script), script);

    const pageIr = {
        components_scripts: {},
        component_instances: [],
        hoisted: { imports: [], declarations: [], functions: [], signals: [], state: [], code: [] },
        signals: [],
        import_records: []
    };
    mergeComponentIr(
        pageIr,
        { components_scripts: { comp_hoist: script }, hoisted: { imports: [] }, component_instances: [] },
        'src/components/Card.zen',
        'src/pages/index.zen',
        { includeCode: false, cssImportsOnly: false, srcDir: 'src' },
        new Set()
    );

    assert.equal(pageIr.components_scripts.comp_hoist.module_id, moduleId);
    assert.equal(pageIr.components_scripts.comp_hoist.hoist_id, 'comp_hoist');
    assert.equal(pageIr.components_scripts.comp_hoist, script);
}

function assertPipeline() {
    assert.equal(existsSync(compilerBin), true, `compiler binary missing at ${compilerBin}`);
    assert.equal(existsSync(bundlerBin), true, `bundler binary missing at ${bundlerBin}`);

    const root = mkdtempSync(join(tmpdir(), 'zenith-module-id-'));
    try {
        const cardPath = join(root, 'Card.zen');
        writeFileSync(
            cardPath,
            '<script lang="ts">\nconst ready = true\n</script>\n<p>Ready</p>\n',
            'utf8'
        );
        const compiled = spawnSync(compilerBin, [cardPath], { encoding: 'utf8' });
        assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
        const compilerIr = JSON.parse(compiled.stdout);
        assert.deepEqual(compilerIr.components_scripts, {});
        assert.equal(compilerIr.html.includes('<script'), false);

        const moduleId = componentScriptModuleId('src/components/Card.zen', 0);
        const script = {
            hoist_id: 'comp_hoist',
            module_id: moduleId,
            factory: 'createComponent_comp_hoist',
            imports: [],
            deps: [],
            code: 'export function createComponent_comp_hoist(host, props, runtime){ return { mount(){ void host; void props; void runtime; }, update(){}, destroy(){}, bindings:Object.freeze({}) }; }'
        };
        const pageIr = {
            ...compilerIr,
            components_scripts: {},
            component_instances: compilerIr.component_instances || [],
            hoisted: compilerIr.hoisted,
            signals: compilerIr.signals || [],
            import_records: []
        };
        mergeComponentIr(
            pageIr,
            { components_scripts: { comp_hoist: script }, hoisted: { imports: [] }, component_instances: [] },
            'src/components/Card.zen',
            cardPath,
            { includeCode: false, cssImportsOnly: false, srcDir: 'src' },
            new Set()
        );
        assert.equal(pageIr.components_scripts.comp_hoist.module_id, moduleId);

        const envelope = {
            route: '/',
            file: 'src/pages/index.zen',
            router: false,
            ir: {
                ir_version: 1,
                graph_hash: graphHash(['root_hoist']),
                graph_edges: [],
                graph_nodes: [{ id: 'src/pages/index.zen', hoist_id: 'root_hoist' }],
                html: '<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>',
                expressions: [],
                hoisted: { imports: [], declarations: [], functions: [], signals: [], state: [], code: [] },
                components_scripts: pageIr.components_scripts,
                component_instances: [],
                imports: [],
                modules: [],
                signals: [],
                expression_bindings: [],
                marker_bindings: [],
                event_bindings: [],
                style_blocks: []
            }
        };

        const bundled = spawnSync(bundlerBin, ['--out-dir', join(root, 'dist')], {
            input: JSON.stringify([envelope]),
            encoding: 'utf8'
        });
        assert.equal(bundled.status, 0, bundled.stderr || bundled.stdout);
        assert.equal((bundled.stderr || '').includes('module_id must be non-empty'), false);

        const stripped = structuredClone(envelope);
        delete stripped.ir.components_scripts.comp_hoist.module_id;
        const rejected = spawnSync(bundlerBin, ['--out-dir', join(root, 'dist-empty')], {
            input: JSON.stringify([stripped]),
            encoding: 'utf8'
        });
        assert.notEqual(rejected.status, 0);
        assert.equal(rejected.stderr.includes('module_id must be non-empty'), true);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

assertForward();
assertPipeline();
console.log('component-script module_id ownership fixture passed');
