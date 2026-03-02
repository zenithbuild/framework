/**
 * Zenith CLI Prompts
 * 
 * Interactive prompts with visual indicators using @clack/prompts.
 * Gracefully degrades in non-TTY environments.
 */

import * as p from '@clack/prompts'
import { createColors } from 'picocolors'
import * as brand from './branding.js'
import { getUiMode } from './ui/env.js'

function pc() {
    const mode = getUiMode(process)
    return createColors(mode.color)
}

/**
 * Zenith-styled intro with animated logo
 */
export async function intro(): Promise<void> {
    await brand.animateLogo()
    console.log()
    const mode = getUiMode(process)
    if (mode.plain) {
        console.log('create-zenith')
        return
    }
    const colors = pc()
    p.intro(colors.bgCyan(colors.black(' create-zenith ')))
}

/**
 * Zenith-styled text input
 */
export async function text(opts: {
    message: string
    placeholder?: string
    defaultValue?: string
    validate?: (value: string) => string | undefined
}): Promise<string | symbol> {
    if (!brand.isTTY()) {
        return opts.defaultValue || ''
    }

    return await p.text({
        message: opts.message,
        placeholder: opts.placeholder,
        defaultValue: opts.defaultValue,
        validate: opts.validate
    })
}

/**
 * Zenith-styled confirm prompt
 */
export async function confirm(opts: {
    message: string
    initialValue?: boolean
}): Promise<boolean | symbol> {
    if (!brand.isTTY()) {
        return opts.initialValue ?? true
    }

    return await p.confirm({
        message: opts.message,
        initialValue: opts.initialValue ?? true
    })
}

/**
 * Zenith-styled select prompt
 */
export async function select<T extends string>(opts: {
    message: string
    options: { value: T; label: string; hint?: string }[]
    initialValue?: T
}): Promise<T | symbol> {
    if (!brand.isTTY()) {
        return opts.initialValue || opts.options[0]?.value
    }

    return await p.select(opts as any) as T | symbol
}

/**
 * Check if user cancelled the prompt
 */
export function isCancel(value: unknown): value is symbol {
    return p.isCancel(value)
}

/**
 * Handle user cancellation gracefully
 */
export function handleCancel(): never {
    if (getUiMode(process).plain) {
        console.log('WARN: Operation cancelled.')
    } else {
        p.cancel('Operation cancelled.')
    }
    process.exit(0)
}

/**
 * Zenith-styled spinner for async operations
 */
export function spinner(): ReturnType<typeof p.spinner> {
    if (getUiMode(process).animate) {
        return p.spinner()
    }
    return {
        start(message: string) {
            console.log(`INFO: ${message}`)
        },
        stop(message?: string) {
            if (message) {
                console.log(`OK: ${message}`)
            }
        },
        message(message: string) {
            console.log(`INFO: ${message}`)
        }
    } as ReturnType<typeof p.spinner>
}

/**
 * Zenith-styled outro with success message and next steps
 */
export async function outro(projectName: string, packageManager: string): Promise<void> {
    await brand.showCompletionAnimation()
    brand.showNextSteps(projectName, packageManager)
}

/**
 * Log helpers that wrap @clack/prompts log functions
 */
export const log = {
    info: (message: string) => getUiMode(process).plain ? console.log(`INFO: ${message}`) : p.log.info(message),
    success: (message: string) => getUiMode(process).plain ? console.log(`OK: ${message}`) : p.log.success(message),
    warn: (message: string) => getUiMode(process).plain ? console.log(`WARN: ${message}`) : p.log.warn(message),
    error: (message: string) => getUiMode(process).plain ? console.log(`ERROR: ${message}`) : p.log.error(message),
    step: (message: string) => getUiMode(process).plain ? console.log(`STEP: ${message}`) : p.log.step(message),
    message: (message: string) => getUiMode(process).plain ? console.log(message) : p.log.message(message)
}
