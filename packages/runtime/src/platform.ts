// ---------------------------------------------------------------------------
// platform.ts — Zenith Runtime canonical DOM/platform helpers
// ---------------------------------------------------------------------------
// zenOn: SSR-safe event subscription with disposer
// zenResize: window resize handler with rAF throttle
// collectRefs: deterministic null-filtered ref collection
// ---------------------------------------------------------------------------

import { zenWindow } from './env.js';

type ZenTimerHandle = number;
type ResizeSize = { w: number; h: number };

export function zenOn(
    target: EventTarget | null,
    eventName: string,
    handler: EventListener,
    options?: AddEventListenerOptions | boolean
): () => void {
    if (!target || typeof target.addEventListener !== 'function') {
        return () => {};
    }

    target.addEventListener(eventName, handler, options);
    return () => {
        target.removeEventListener(eventName, handler, options);
    };
}

export function zenResize(handler: (size: ResizeSize) => void): () => void {
    const win = zenWindow();
    if (!win || typeof win.addEventListener !== 'function') {
        return () => {};
    }

    const activeWindow = win;
    const hasRaf =
        typeof activeWindow.requestAnimationFrame === 'function'
        && typeof activeWindow.cancelAnimationFrame === 'function';
    let scheduledId: ZenTimerHandle | null = null;
    let lastW = Number.NaN;
    let lastH = Number.NaN;

    const schedule = (callback: FrameRequestCallback): ZenTimerHandle => {
        if (hasRaf) {
            return activeWindow.requestAnimationFrame(callback);
        }
        return activeWindow.setTimeout(callback, 0);
    };

    const cancel = (id: ZenTimerHandle): void => {
        if (hasRaf) {
            activeWindow.cancelAnimationFrame(id);
            return;
        }
        activeWindow.clearTimeout(id);
    };

    function onResize(): void {
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

type RefLike<T extends Element> = { current?: T | null } | null | undefined;

export function collectRefs<T extends Element>(...refs: RefLike<T>[]): T[] {
    const out: T[] = [];
    for (let index = 0; index < refs.length; index += 1) {
        const node = refs[index]?.current;
        if (node && typeof node === 'object' && typeof node.nodeType === 'number') {
            out.push(node);
        }
    }
    return out;
}
