function assertRuntimeImport(runtimeImport: string): void {
    if (typeof runtimeImport !== 'string' || runtimeImport.trim().length === 0) {
        throw new Error('[Zenith Core] coreModuleSource(runtimeImport) requires non-empty runtimeImport');
    }
}

export function coreModuleSource(runtimeImport: string): string {
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
