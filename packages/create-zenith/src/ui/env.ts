export interface UiMode {
    tty: boolean
    plain: boolean
    color: boolean
    animate: boolean
    debug: boolean
}

function flagEnabled(value: string | undefined): boolean {
    if (value == null) return false
    const normalized = value.trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function getUiMode(runtime: typeof process = process): UiMode {
    const tty = Boolean(runtime.stdout?.isTTY)
    const ci = flagEnabled(runtime.env.CI)
    const noUi = flagEnabled(runtime.env.ZENITH_NO_UI)
    const noColor = runtime.env.NO_COLOR !== undefined
    const forceColor = flagEnabled(runtime.env.FORCE_COLOR)
    const debug = flagEnabled(runtime.env.ZENITH_DEBUG)

    const plain = noUi || ci || !tty
    const color = !plain && !noColor && (forceColor || tty)
    const animate = tty && !plain && !ci

    return { tty, plain, color, animate, debug }
}
