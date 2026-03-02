// ---------------------------------------------------------------------------
// core-template.js — source template for emitted core asset
// ---------------------------------------------------------------------------

function assertRuntimeImport(runtimeImport) {
    if (typeof runtimeImport !== 'string' || runtimeImport.trim().length === 0) {
        throw new Error('[Zenith Core] coreModuleSource(runtimeImport) requires non-empty runtimeImport');
    }
}

export function coreModuleSource(runtimeImport) {
    assertRuntimeImport(runtimeImport);
    const runtimeImportLiteral = JSON.stringify(runtimeImport);

    return [
        `import { signal, state, zeneffect, zenEffect as __zenithZenEffect, zenMount as __zenithZenMount } from ${runtimeImportLiteral};`,
        '',
        'export const zenSignal = signal;',
        'export const zenState = state;',
        'export const zenEffect = __zenithZenEffect;',
        'export const zenMount = __zenithZenMount;',
        '',
        'export function zenOnMount(callback) {',
        '  return __zenithZenMount(callback);',
        '}',
        '',
        'export { signal, state, zeneffect };',
        ''
    ].join('\n');
}
