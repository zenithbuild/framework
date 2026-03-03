export type UiLogLevel = 'quiet' | 'normal' | 'verbose';

export interface UiMode {
    plain: boolean;
    color: boolean;
    tty: boolean;
    ci: boolean;
    spinner: boolean;
    debug: boolean;
    logLevel: UiLogLevel;
}

export interface UiRuntime {
    env?: Record<string, string | undefined>;
    stdout?: {
        isTTY?: boolean;
    };
}

function flagEnabled(value: string | number | boolean | null | undefined): boolean {
    if (value === undefined || value === null) {
        return false;
    }
    const normalized = String(value).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parseLogLevel(value: string | null | undefined): UiLogLevel {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'quiet' || normalized === 'verbose') {
        return normalized;
    }
    return 'normal';
}

export function getUiMode(runtime: UiRuntime = process): UiMode {
    const env = runtime.env || {};
    const tty = Boolean(runtime.stdout?.isTTY);
    const ci = flagEnabled(env.CI);
    const noUi = flagEnabled(env.ZENITH_NO_UI);
    const noColor = env.NO_COLOR !== undefined && String(env.NO_COLOR).length >= 0;
    const forceColor = flagEnabled(env.FORCE_COLOR);
    const debug = flagEnabled(env.ZENITH_DEBUG);
    let logLevel = parseLogLevel(env.ZENITH_LOG_LEVEL);

    const plain = noUi || ci || !tty;
    const color = !plain && !noColor && (forceColor || tty);
    const spinner = tty && !plain && !ci;
    if (flagEnabled(env.ZENITH_DEV_TRACE)) {
        logLevel = 'verbose';
    }
    if (debug && logLevel !== 'quiet') {
        logLevel = 'verbose';
    }

    return {
        plain,
        color,
        tty,
        ci,
        spinner,
        debug,
        logLevel
    };
}

export function isUiPlain(runtime: UiRuntime = process): boolean {
    return getUiMode(runtime).plain;
}
