// @ts-nocheck

import { zenOn } from './platform.js';

/**
 * @typedef {'hidden' | 'entering' | 'present' | 'exiting'} ZenPresencePhase
 */

function isRefLike(value) {
    return !!value && typeof value === 'object' && 'current' in value;
}

function normalizeOptions(options) {
    if (options === undefined || options === null) {
        return {
            timeoutMs: undefined,
            onPhaseChange: null
        };
    }

    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new Error('[Zenith Runtime] zenPresence(ref, options) requires an options object when provided');
    }

    if (options.timeoutMs !== undefined) {
        if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0) {
            throw new Error('[Zenith Runtime] zenPresence options.timeoutMs must be a non-negative number');
        }
    }

    if (options.onPhaseChange !== undefined && typeof options.onPhaseChange !== 'function') {
        throw new Error('[Zenith Runtime] zenPresence options.onPhaseChange must be a function when provided');
    }

    return {
        timeoutMs: options.timeoutMs === undefined ? undefined : Math.floor(options.timeoutMs),
        onPhaseChange: typeof options.onPhaseChange === 'function' ? options.onPhaseChange : null
    };
}

function parseCssTimeToken(token) {
    const value = String(token || '').trim();
    if (value.length === 0) {
        return 0;
    }

    if (value.endsWith('ms')) {
        const ms = Number.parseFloat(value.slice(0, -2));
        return Number.isFinite(ms) ? Math.max(0, ms) : 0;
    }

    if (value.endsWith('s')) {
        const seconds = Number.parseFloat(value.slice(0, -1));
        return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 0;
    }

    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function parseCssTimeList(value) {
    return String(value || '')
        .split(',')
        .map((token) => parseCssTimeToken(token))
        .filter((candidate) => Number.isFinite(candidate));
}

function computeMaxCssTotal(durations, delays) {
    if (!Array.isArray(durations) || durations.length === 0) {
        return 0;
    }

    let maxTotal = 0;
    for (let index = 0; index < durations.length; index += 1) {
        const duration = durations[index] || 0;
        const delay = Array.isArray(delays) && delays.length > 0
            ? delays[index % delays.length] || 0
            : 0;
        const total = duration + delay;
        if (total > maxTotal) {
            maxTotal = total;
        }
    }
    return maxTotal;
}

function resolveFallbackTimeoutMs(node, explicitTimeoutMs) {
    if (Number.isFinite(explicitTimeoutMs)) {
        return explicitTimeoutMs;
    }

    const activeWindow = node?.ownerDocument?.defaultView;
    if (!activeWindow || typeof activeWindow.getComputedStyle !== 'function') {
        return 34;
    }

    const styles = activeWindow.getComputedStyle(node);
    const transitionTotal = computeMaxCssTotal(
        parseCssTimeList(styles.transitionDuration),
        parseCssTimeList(styles.transitionDelay)
    );
    const animationTotal = computeMaxCssTotal(
        parseCssTimeList(styles.animationDuration),
        parseCssTimeList(styles.animationDelay)
    );
    const total = Math.max(transitionTotal, animationTotal);
    return total > 0 ? Math.ceil(total + 34) : 34;
}

function getTimerApi(node) {
    const activeWindow = node?.ownerDocument?.defaultView;
    if (activeWindow && typeof activeWindow.setTimeout === 'function' && typeof activeWindow.clearTimeout === 'function') {
        return {
            setTimeout: activeWindow.setTimeout.bind(activeWindow),
            clearTimeout: activeWindow.clearTimeout.bind(activeWindow)
        };
    }

    return {
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis)
    };
}

function isOwnedEvent(event, node) {
    return !!event && event.target === node;
}

/**
 * Ref-owned presence controller for always-mounted nodes.
 *
 * Canonical pattern:
 * - create once per ref
 * - call `presence.mount()` inside `zenMount`
 * - drive `presence.setPresent(next)` from reactive state
 *
 * @template {Element} T
 * @param {{ current?: T | null }} ref
 * @param {{ timeoutMs?: number, onPhaseChange?: ((phase: ZenPresencePhase, context: { node: T | null, previousPhase: ZenPresencePhase | null, present: boolean }) => void) } | null | undefined} [options]
 * @returns {{
 *   mount: () => () => void,
 *   destroy: () => void,
 *   getPhase: () => ZenPresencePhase,
 *   setPresent: (nextPresent: boolean) => void
 * }}
 */
export function zenPresence(ref, options = null) {
    if (!isRefLike(ref)) {
        throw new Error('[Zenith Runtime] zenPresence(ref, options) requires a ref-like object with current');
    }

    const normalizedOptions = normalizeOptions(options);
    let desiredPresent = false;
    /** @type {ZenPresencePhase} */
    let currentPhase = 'hidden';
    let mounted = false;
    let mountEpoch = 0;
    let pendingCompletion = null;

    function getNode() {
        const candidate = ref.current;
        if (!candidate || typeof candidate !== 'object' || typeof candidate.nodeType !== 'number') {
            return null;
        }
        return candidate;
    }

    function notifyPhaseChange(previousPhase) {
        if (typeof normalizedOptions.onPhaseChange !== 'function') {
            return;
        }
        normalizedOptions.onPhaseChange(currentPhase, {
            node: getNode(),
            previousPhase,
            present: desiredPresent
        });
    }

    function applyPhaseToNode() {
        const node = getNode();
        if (!node) {
            return;
        }
        node.setAttribute('data-zen-presence', currentPhase);
    }

    function setPhase(nextPhase, forceApply = false) {
        const previousPhase = currentPhase;
        const changed = previousPhase !== nextPhase;
        if (!changed && !forceApply) {
            return;
        }
        currentPhase = nextPhase;
        applyPhaseToNode();
        if (changed) {
            notifyPhaseChange(previousPhase);
        }
    }

    function cancelPendingCompletion() {
        if (!pendingCompletion) {
            return;
        }
        pendingCompletion.cancel();
        pendingCompletion = null;
    }

    function scheduleCompletion(targetPhase, node) {
        cancelPendingCompletion();

        if (!mounted || !node) {
            setPhase(targetPhase);
            return;
        }

        const timerApi = getTimerApi(node);
        const timeoutMs = resolveFallbackTimeoutMs(node, normalizedOptions.timeoutMs);
        const disposers = [];
        let settled = false;
        let timeoutId = null;

        const settle = () => {
            if (settled) {
                return;
            }
            settled = true;
            while (disposers.length > 0) {
                const dispose = disposers.pop();
                try {
                    dispose();
                } catch {
                }
            }
            if (timeoutId !== null) {
                timerApi.clearTimeout(timeoutId);
                timeoutId = null;
            }
            pendingCompletion = null;
            setPhase(targetPhase);
        };

        const handleEnd = (event) => {
            if (!isOwnedEvent(event, node)) {
                return;
            }
            settle();
        };

        disposers.push(zenOn(node, 'transitionend', handleEnd));
        disposers.push(zenOn(node, 'animationend', handleEnd));
        timeoutId = timerApi.setTimeout(settle, timeoutMs);

        pendingCompletion = {
            cancel() {
                if (settled) {
                    return;
                }
                settled = true;
                while (disposers.length > 0) {
                    const dispose = disposers.pop();
                    try {
                        dispose();
                    } catch {
                    }
                }
                if (timeoutId !== null) {
                    timerApi.clearTimeout(timeoutId);
                    timeoutId = null;
                }
            }
        };
    }

    function reconcile() {
        if (!mounted) {
            return;
        }

        const node = getNode();
        if (!node) {
            cancelPendingCompletion();
            return;
        }

        if (desiredPresent) {
            if (currentPhase === 'entering' || currentPhase === 'present') {
                return;
            }
            setPhase('entering');
            scheduleCompletion('present', node);
            return;
        }

        if (currentPhase === 'hidden' || currentPhase === 'exiting') {
            return;
        }

        setPhase('exiting');
        scheduleCompletion('hidden', node);
    }

    function destroyCurrentMount() {
        mounted = false;
        cancelPendingCompletion();
        currentPhase = 'hidden';
        const node = getNode();
        if (node) {
            node.removeAttribute('data-zen-presence');
        }
    }

    return {
        mount() {
            mountEpoch += 1;
            const activeMount = mountEpoch;
            mounted = true;
            setPhase(currentPhase, true);
            reconcile();

            return () => {
                if (activeMount !== mountEpoch) {
                    return;
                }
                destroyCurrentMount();
            };
        },
        destroy() {
            mountEpoch += 1;
            destroyCurrentMount();
        },
        getPhase() {
            return currentPhase;
        },
        setPresent(nextPresent) {
            desiredPresent = nextPresent === true;
            reconcile();
        }
    };
}

/**
 * @alias zenPresence
 * @description Optional secondary alias for the canonical zenPresence helper.
 */
export const presence = zenPresence;
