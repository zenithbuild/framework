// @ts-nocheck

import { createAutoTrackedEffect, createExplicitDependencyEffect } from './effect-runtime.js';
import { normalizeEffectOptions } from './effect-utils.js';
import { createMountEffect } from './mount-runtime.js';
import { resolveSideEffectScope } from './side-effect-scope.js';

export { _nextReactiveId, _trackDependency } from './reactivity-core.js';
export {
    resetGlobalSideEffects,
    createSideEffectScope,
    activateSideEffectScope,
    disposeSideEffectScope
} from './side-effect-scope.js';

export function zenEffect(effect, options = null, scopeOverride = null) {
    if (typeof effect !== 'function') {
        throw new Error('[Zenith Runtime] zenEffect(effect) requires a callback function');
    }

    return createAutoTrackedEffect(
        effect,
        normalizeEffectOptions(options),
        resolveSideEffectScope(scopeOverride)
    );
}

export function zeneffect(effectOrDependencies, optionsOrEffect, scopeOverride = null) {
    const scope = resolveSideEffectScope(scopeOverride);

    if (Array.isArray(effectOrDependencies)) {
        if (typeof optionsOrEffect !== 'function') {
            throw new Error('[Zenith Runtime] zeneffect(deps, effect) requires an effect function');
        }
        return createExplicitDependencyEffect(optionsOrEffect, effectOrDependencies, scope);
    }

    if (typeof effectOrDependencies === 'function') {
        return createAutoTrackedEffect(
            effectOrDependencies,
            normalizeEffectOptions(optionsOrEffect),
            scope
        );
    }

    throw new Error('[Zenith Runtime] zeneffect() invalid arguments. Expected (effect) or (dependencies, effect)');
}

export function zenMount(callback, scopeOverride = null) {
    if (typeof callback !== 'function') {
        throw new Error('[Zenith Runtime] zenMount(callback) requires a function');
    }

    return createMountEffect(callback, resolveSideEffectScope(scopeOverride));
}

/**
 * @alias zeneffect
 * @description Optional secondary alias for the canonical zeneffect primitive.
 */
export function effect(effectOrDependencies, optionsOrEffect, scopeOverride = null) {
    return zeneffect(effectOrDependencies, optionsOrEffect, scopeOverride);
}

/**
 * @alias zenMount
 * @description Optional secondary alias for the canonical zenMount primitive.
 */
export function mount(callback, scopeOverride = null) {
    return zenMount(callback, scopeOverride);
}
