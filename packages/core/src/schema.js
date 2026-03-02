// ---------------------------------------------------------------------------
// schema.js — Zenith Core IR authority
// ---------------------------------------------------------------------------

export const IR_VERSION = 1;

export const IR_SCHEMA = Object.freeze({
    version: IR_VERSION,
    requiredTopLevelKeys: Object.freeze([
        'ir_version',
        'graph_hash',
        'graph_edges',
        'graph_nodes',
        'html',
        'expressions',
        'hoisted',
        'components_scripts',
        'component_instances',
        'imports',
        'modules',
        'prerender',
        'signals',
        'expression_bindings',
        'marker_bindings',
        'event_bindings',
        'style_blocks'
    ])
});
