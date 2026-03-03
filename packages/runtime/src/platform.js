// ---------------------------------------------------------------------------
// platform.js — Zenith Runtime canonical DOM/platform helpers
// ---------------------------------------------------------------------------
// zenOn: SSR-safe event subscription with disposer
// zenResize: window resize handler with rAF throttle
// collectRefs: deterministic null-filtered ref collection
// ---------------------------------------------------------------------------

import { zenWindow } from './env.js';

/**
 * @typedef {number} ZenTimerHandle
 */

/**
 * SSR-safe event subscription. Returns disposer.
 * @param {EventTarget | null} target
 * @param {string} eventName
 * @param {EventListener} handler
 * @param {AddEventListenerOptions | boolean} [options]
 * @returns {() => void}
 */
export function zenOn(target, eventName, handler, options) {
    if (!target || typeof target.addEventListener !== 'function') {
        return () => {};
    }
    target.addEventListener(eventName, handler, options);
    return () => {
        target.removeEventListener(eventName, handler, options);
    };
}

/**
 * Window resize handler with requestAnimationFrame throttle.
 * Returns disposer.
 * @param {(size: { w: number; h: number }) => void} handler
 * @returns {() => void}
 */
export function zenResize(handler) {
    const win = zenWindow();
    if (!win || typeof win.addEventListener !== 'function') {
        return () => {};
    }
    /** @type {Window} */
    const activeWindow = win;
    const hasRaf =
        typeof activeWindow.requestAnimationFrame === 'function'
        && typeof activeWindow.cancelAnimationFrame === 'function';
    /** @type {ZenTimerHandle | null} */
    let scheduledId = null;
    let lastW = Number.NaN;
    let lastH = Number.NaN;

    /**
     * @param {FrameRequestCallback} callback
     * @returns {ZenTimerHandle}
     */
    const schedule = (callback) => {
        if (hasRaf) {
            return activeWindow.requestAnimationFrame(callback);
        }
        return activeWindow.setTimeout(callback, 0);
    };

    /**
     * @param {ZenTimerHandle} id
     * @returns {void}
     */
    const cancel = (id) => {
        if (hasRaf) {
            activeWindow.cancelAnimationFrame(id);
            return;
        }
        activeWindow.clearTimeout(id);
    };

    function onResize() {
        if (scheduledId !== null) return;
        scheduledId = schedule(() => {
            scheduledId = null;
            const w = activeWindow.innerWidth;
            const h = activeWindow.innerHeight;
            if (w !== lastW || h !== lastH) {
                lastW = w;
                lastH = h;
                handler({ w, h });
            }
        });
    }

    activeWindow.addEventListener('resize', onResize);
    onResize();

    return () => {
        if (scheduledId !== null) {
            cancel(scheduledId);
            scheduledId = null;
        }
        activeWindow.removeEventListener('resize', onResize);
    };
}

/**
 * Deterministic null-filtered collection of ref.current values.
 * @param {...{ current?: Element | null }} refs
 * @returns {Element[]}
 */
export function collectRefs(...refs) {
    const out = [];
    for (let i = 0; i < refs.length; i++) {
        const node = refs[i] && refs[i].current;
        if (node && typeof node === 'object' && typeof node.nodeType === 'number') {
            out.push(node);
        }
    }
    return out;
}
