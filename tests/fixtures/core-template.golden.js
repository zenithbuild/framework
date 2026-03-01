import { signal, state, zeneffect, zenEffect as __zenithZenEffect, zenMount as __zenithZenMount } from "/assets/runtime.11111111.js";

export const zenSignal = signal;
export const zenState = state;
export const zenEffect = __zenithZenEffect;
export const zenMount = __zenithZenMount;

export function zenOnMount(callback) {
  return __zenithZenMount(callback);
}

export { signal, state, zeneffect };
