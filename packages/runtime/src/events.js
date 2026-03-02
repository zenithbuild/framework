// ---------------------------------------------------------------------------
// events.js — Zenith Runtime V0
// ---------------------------------------------------------------------------
// Event binding system.
//
// For: <button data-zx-on-click="1">
//
// Algorithm:
//   1. Extract event name from attribute suffix ("click")
//   2. Resolve expression at index → must be a function
//   3. addEventListener directly
//
// No synthetic events.
// No delegation.
// No wrapping.
// ---------------------------------------------------------------------------

import { _registerListener } from './cleanup.js';
import { rethrowZenithRuntimeError, throwZenithRuntimeError } from './diagnostics.js';

/**
 * Bind an event listener to a DOM element.
 *
 * @param {Element} element - The DOM element
 * @param {string} eventName - The event name (e.g. "click")
 * @param {() => any} exprFn - Pre-bound expression function that must resolve to a handler
 */
export function bindEvent(element, eventName, exprFn) {
    const resolved = exprFn();

    if (typeof resolved !== 'function') {
        throwZenithRuntimeError({
            phase: 'bind',
            code: 'BINDING_APPLY_FAILED',
            message: `Event binding did not resolve to a function for "${eventName}"`,
            marker: { type: `data-zx-on-${eventName}`, id: '<unknown>' },
            path: `event:${eventName}`,
            hint: 'Bind events to function references.'
        });
    }

    const wrapped = function zenithBoundEvent(event) {
        try {
            return resolved.call(this, event);
        } catch (error) {
            rethrowZenithRuntimeError(error, {
                phase: 'event',
                code: 'EVENT_HANDLER_FAILED',
                message: `Event handler failed for "${eventName}"`,
                marker: { type: `data-zx-on-${eventName}`, id: '<unknown>' },
                path: `event:${eventName}:${resolved.name || '<anonymous>'}`,
                hint: 'Inspect handler logic and referenced state.'
            });
        }
    };

    element.addEventListener(eventName, wrapped);
    _registerListener(element, eventName, wrapped);
}
