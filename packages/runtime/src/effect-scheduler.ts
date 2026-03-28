// @ts-nocheck

export function createScheduler(runNow, options) {
    let microtaskQueued = false;
    let debounceTimer = null;
    let throttleTimer = null;
    let rafHandle = null;
    let lastRunAt = 0;

    function clearScheduledWork() {
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        if (throttleTimer !== null) {
            clearTimeout(throttleTimer);
            throttleTimer = null;
        }
        if (rafHandle !== null) {
            if (typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(rafHandle);
            } else {
                clearTimeout(rafHandle);
            }
            rafHandle = null;
        }
        microtaskQueued = false;
    }

    function invokeNow() {
        microtaskQueued = false;
        debounceTimer = null;
        throttleTimer = null;
        rafHandle = null;
        lastRunAt = Date.now();
        runNow();
    }

    function schedule() {
        if (options.debounceMs > 0) {
            if (debounceTimer !== null) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(invokeNow, options.debounceMs);
            return;
        }

        if (options.throttleMs > 0) {
            const now = Date.now();
            const elapsed = now - lastRunAt;
            if (lastRunAt === 0 || elapsed >= options.throttleMs) {
                invokeNow();
                return;
            }

            if (throttleTimer !== null) {
                return;
            }

            throttleTimer = setTimeout(invokeNow, options.throttleMs - elapsed);
            return;
        }

        if (options.raf) {
            if (rafHandle !== null) {
                if (typeof cancelAnimationFrame === 'function') {
                    cancelAnimationFrame(rafHandle);
                } else {
                    clearTimeout(rafHandle);
                }
            }

            if (typeof requestAnimationFrame === 'function') {
                rafHandle = requestAnimationFrame(invokeNow);
            } else {
                rafHandle = setTimeout(invokeNow, 16);
            }
            return;
        }

        if (options.flush === 'sync') {
            invokeNow();
            return;
        }

        if (microtaskQueued) {
            return;
        }
        microtaskQueued = true;
        queueMicrotask(invokeNow);
    }

    return {
        schedule,
        cancel: clearScheduledWork
    };
}
