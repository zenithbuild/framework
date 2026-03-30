// @ts-nocheck

import { on, off } from './events.js';

/**
 * @typedef {'idle' | 'leaving' | 'swapping' | 'entering'} ZenNavigationShellPhase
 */

function isRefLike(value) {
    return !!value && typeof value === 'object' && 'current' in value;
}

function normalizeOptions(options) {
    if (options === undefined || options === null) {
        return {
            timeoutMs: undefined,
            onStateChange: null
        };
    }

    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new Error('[Zenith Router] zenNavigationShell(ref, options) requires an options object when provided');
    }

    if (options.timeoutMs !== undefined) {
        if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0) {
            throw new Error('[Zenith Router] zenNavigationShell options.timeoutMs must be a non-negative number');
        }
    }

    if (options.onStateChange !== undefined && typeof options.onStateChange !== 'function') {
        throw new Error('[Zenith Router] zenNavigationShell options.onStateChange must be a function when provided');
    }

    return {
        timeoutMs: options.timeoutMs === undefined ? undefined : Math.floor(options.timeoutMs),
        onStateChange: typeof options.onStateChange === 'function' ? options.onStateChange : null
    };
}

function parseCssTimeToken(token) {
    const value = String(token || '').trim();
    if (value.length === 0) {
        return 0;
    }

    if (value.endsWith('ms')) {
        const milliseconds = Number.parseFloat(value.slice(0, -2));
        return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
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
        .map((entry) => parseCssTimeToken(entry))
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
        return 0;
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
    return total > 0 ? Math.ceil(total + 34) : 0;
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

function addOwnedListener(node, eventName, handler) {
    if (!node || typeof node.addEventListener !== 'function' || typeof node.removeEventListener !== 'function') {
        return () => {
        };
    }

    node.addEventListener(eventName, handler);
    return () => {
        node.removeEventListener(eventName, handler);
    };
}

function isOwnedEvent(event, node) {
    return !!event && event.target === node;
}

function cloneState(state) {
    return {
        phase: state.phase,
        navigationId: state.navigationId,
        navigationType: state.navigationType
    };
}

function normalizeNavigationType(value) {
    return value === 'push' || value === 'pop' ? value : null;
}

function readNavigationId(payload) {
    return payload && typeof payload.navigationId === 'number' ? payload.navigationId : null;
}

function isLifecyclePayload(payload) {
    return !!payload && typeof payload === 'object';
}

/**
 * Tiny visual-only navigation shell controller layered on the existing router lifecycle.
 *
 * @param {{ current?: Element | null }} ref
 * @param {{ timeoutMs?: number, onStateChange?: ((state: { phase: ZenNavigationShellPhase, navigationId: number | null, navigationType: 'push' | 'pop' | null }, context: { previousState: { phase: ZenNavigationShellPhase, navigationId: number | null, navigationType: 'push' | 'pop' | null } }) => void) } | null | undefined} [options]
 * @returns {{
 *   mount: () => () => void,
 *   destroy: () => void,
 *   getPhase: () => ZenNavigationShellPhase,
 *   getState: () => { phase: ZenNavigationShellPhase, navigationId: number | null, navigationType: 'push' | 'pop' | null }
 * }}
 */
export function zenNavigationShell(ref, options = null) {
    if (!isRefLike(ref)) {
        throw new Error('[Zenith Router] zenNavigationShell(ref, options) requires a ref-like object with current');
    }

    const normalizedOptions = normalizeOptions(options);
    let mounted = false;
    let pendingPhaseWait = null;
    let phaseEpoch = 0;
    let routeDisposers = [];
    let shellState = {
        phase: /** @type {ZenNavigationShellPhase} */ ('idle'),
        navigationId: null,
        navigationType: null
    };

    function getNode() {
        const candidate = ref.current;
        if (!candidate || typeof candidate !== 'object' || typeof candidate.nodeType !== 'number') {
            return null;
        }
        return candidate;
    }

    function getState() {
        return cloneState(shellState);
    }

    function applyStateToNode() {
        const node = getNode();
        if (!node) {
            return;
        }

        node.setAttribute('data-zen-navigation-phase', shellState.phase);
        if (shellState.navigationId === null) {
            node.removeAttribute('data-zen-navigation-id');
        } else {
            node.setAttribute('data-zen-navigation-id', String(shellState.navigationId));
        }

        if (shellState.navigationType === null) {
            node.removeAttribute('data-zen-navigation-type');
        } else {
            node.setAttribute('data-zen-navigation-type', shellState.navigationType);
        }
    }

    function clearNodeState() {
        const node = getNode();
        if (!node) {
            return;
        }

        node.removeAttribute('data-zen-navigation-phase');
        node.removeAttribute('data-zen-navigation-id');
        node.removeAttribute('data-zen-navigation-type');
    }

    function notifyStateChange(previousState) {
        if (typeof normalizedOptions.onStateChange !== 'function') {
            return;
        }

        normalizedOptions.onStateChange(getState(), {
            previousState: cloneState(previousState)
        });
    }

    function setState(nextState, forceApply = false) {
        const previousState = cloneState(shellState);
        const changed = previousState.phase !== nextState.phase ||
            previousState.navigationId !== nextState.navigationId ||
            previousState.navigationType !== nextState.navigationType;

        if (!changed && !forceApply) {
            return;
        }

        shellState = cloneState(nextState);
        if (mounted) {
            applyStateToNode();
        }
        if (changed) {
            notifyStateChange(previousState);
        }
    }

    function cancelPendingPhaseWait() {
        if (!pendingPhaseWait) {
            return;
        }

        pendingPhaseWait.cancel();
        pendingPhaseWait = null;
    }

    function resetShellState() {
        phaseEpoch += 1;
        cancelPendingPhaseWait();
        setState({
            phase: 'idle',
            navigationId: null,
            navigationType: null
        });
    }

    function waitForPhaseSettlement(nextPhase, payload) {
        phaseEpoch += 1;
        cancelPendingPhaseWait();

        const navigationId = readNavigationId(payload);
        const navigationType = normalizeNavigationType(payload?.navigationType);

        setState({
            phase: nextPhase,
            navigationId,
            navigationType
        });

        const node = getNode();
        const timeoutMs = resolveFallbackTimeoutMs(node, normalizedOptions.timeoutMs);
        if (!mounted || !node || timeoutMs === 0) {
            return Promise.resolve();
        }

        const timerApi = getTimerApi(node);
        const activeEpoch = phaseEpoch;

        return new Promise((resolve) => {
            const disposers = [];
            let settled = false;
            let timeoutId = null;

            const finish = () => {
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
                if (pendingPhaseWait === record) {
                    pendingPhaseWait = null;
                }
                resolve();
            };

            const handleEnd = (event) => {
                if (activeEpoch !== phaseEpoch) {
                    return;
                }
                if (!isOwnedEvent(event, node)) {
                    return;
                }
                finish();
            };

            disposers.push(addOwnedListener(node, 'transitionend', handleEnd));
            disposers.push(addOwnedListener(node, 'animationend', handleEnd));
            timeoutId = timerApi.setTimeout(finish, timeoutMs);

            const record = {
                cancel() {
                    finish();
                }
            };

            pendingPhaseWait = record;
        });
    }

    async function handlePhase(phase, payload) {
        if (!mounted || !isLifecyclePayload(payload)) {
            return;
        }

        await waitForPhaseSettlement(phase, payload);

        if (!mounted) {
            return;
        }

        const activeNavigationId = readNavigationId(payload);
        if (activeNavigationId !== null && shellState.navigationId !== activeNavigationId) {
            return;
        }

        if (phase === 'entering') {
            setState({
                phase: 'idle',
                navigationId: null,
                navigationType: null
            });
        }
    }

    function shouldResetForPayload(payload) {
        if (!mounted || !isLifecyclePayload(payload)) {
            return false;
        }

        const navigationId = readNavigationId(payload);
        if (navigationId === null) {
            return shellState.phase !== 'idle';
        }

        return shellState.navigationId === navigationId;
    }

    function installRouteListeners() {
        if (routeDisposers.length > 0) {
            return;
        }

        const subscriptions = [
            ['navigation:before-leave', (payload) => handlePhase('leaving', payload)],
            ['navigation:before-swap', (payload) => handlePhase('swapping', payload)],
            ['navigation:before-enter', (payload) => handlePhase('entering', payload)],
            ['navigation:abort', (payload) => {
                if (shouldResetForPayload(payload)) {
                    resetShellState();
                }
            }],
            ['navigation:error', (payload) => {
                if (shouldResetForPayload(payload)) {
                    resetShellState();
                }
            }]
        ];

        for (let index = 0; index < subscriptions.length; index += 1) {
            const [eventName, handler] = subscriptions[index];
            on(eventName, handler);
            routeDisposers.push(() => {
                off(eventName, handler);
            });
        }
    }

    function destroy() {
        cancelPendingPhaseWait();

        while (routeDisposers.length > 0) {
            const dispose = routeDisposers.pop();
            try {
                dispose();
            } catch {
            }
        }

        const previousState = cloneState(shellState);
        mounted = false;
        shellState = {
            phase: 'idle',
            navigationId: null,
            navigationType: null
        };
        clearNodeState();
        if (previousState.phase !== 'idle' || previousState.navigationId !== null || previousState.navigationType !== null) {
            notifyStateChange(previousState);
        }
    }

    function mount() {
        destroy();
        mounted = true;
        installRouteListeners();
        setState({
            phase: 'idle',
            navigationId: null,
            navigationType: null
        }, true);
        return destroy;
    }

    return {
        mount,
        destroy,
        getPhase() {
            return shellState.phase;
        },
        getState
    };
}
