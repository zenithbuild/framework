import { performance } from 'node:perf_hooks';

const STARTUP_PROFILE_ENV = 'ZENITH_STARTUP_PROFILE';

function roundMs(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}

export function createStartupProfiler(scope) {
    const enabled = process.env[STARTUP_PROFILE_ENV] === '1';
    const startedAt = performance.now();

    function emit(event, payload = {}) {
        if (!enabled) {
            return;
        }

        const record = {
            scope,
            event,
            atMs: roundMs(performance.now() - startedAt),
            ...payload
        };

        try {
            console.error(`[zenith-startup] ${JSON.stringify(record)}`);
        } catch {
            // profiling must never break runtime behavior
        }
    }

    function measureSync(label, fn, payload = {}) {
        const stepStartedAt = performance.now();
        try {
            return fn();
        } finally {
            emit('step', {
                label,
                durationMs: roundMs(performance.now() - stepStartedAt),
                ...payload
            });
        }
    }

    async function measureAsync(label, fn, payload = {}) {
        const stepStartedAt = performance.now();
        try {
            return await fn();
        } finally {
            emit('step', {
                label,
                durationMs: roundMs(performance.now() - stepStartedAt),
                ...payload
            });
        }
    }

    return {
        enabled,
        emit,
        measureSync,
        measureAsync,
        nowMs() {
            return roundMs(performance.now() - startedAt);
        },
        roundMs
    };
}
