/**
 * Zenith CLI Branding
 *
 * Deterministic output with plain/TTY-aware behavior.
 */

import { createColors } from 'picocolors'
import gradient from 'gradient-string'
import { getUiMode } from './ui/env.js'

function ui() {
    return getUiMode(process)
}

function pc() {
    return createColors(ui().color)
}

function zenithGradientText(text: string): string {
    if (!ui().color) return text
    return gradient(['#3b82f6', '#06b6d4', '#22d3ee'])(text)
}

// Brand colors
export const colors = {
    primary: (text: string) => pc().blue(text),
    secondary: (text: string) => pc().cyan(text),
    success: (text: string) => pc().green(text),
    warning: (text: string) => pc().yellow(text),
    error: (text: string) => pc().red(text),
    muted: (text: string) => pc().gray(text),
    bold: (text: string) => pc().bold(text),
    dim: (text: string) => pc().dim(text)
}

// Check if running in interactive TTY mode (safe for animations/prompts)
export function isTTY(): boolean {
    return ui().animate
}

const LOGO_LINES = [
    '  ███████╗███████╗███╗   ██╗██╗████████╗██╗  ██╗',
    '  ╚══███╔╝██╔════╝████╗  ██║██║╚══██╔══╝██║  ██║',
    '    ███╔╝ █████╗  ██╔██╗ ██║██║   ██║   ███████║',
    '   ███╔╝  ██╔══╝  ██║╚██╗██║██║   ██║   ██╔══██║',
    '  ███████╗███████╗██║ ╚████║██║   ██║   ██║  ██║',
    '  ╚══════╝╚══════╝╚═╝  ╚═══╝╚═╝   ╚═╝   ╚═╝  ╚═╝'
]

const TAGLINE = 'The Modern Reactive Web Framework'

function renderLogoLine(line: string): string {
    return ui().color ? zenithGradientText(line) : line
}

export const LOGO = `
${pc().cyan('╔' + '═'.repeat(55) + '╗')}
${pc().cyan('║')}${' '.repeat(55)}${pc().cyan('║')}
${LOGO_LINES.map(line => `${pc().cyan('║')}  ${renderLogoLine(line)}  ${pc().cyan('║')}`).join('\n')}
${pc().cyan('║')}${' '.repeat(55)}${pc().cyan('║')}
${pc().cyan('║')}${' '.repeat(10)}${pc().dim(TAGLINE)}${' '.repeat(10)}${pc().cyan('║')}
${pc().cyan('║')}${' '.repeat(55)}${pc().cyan('║')}
${pc().cyan('╚' + '═'.repeat(55) + '╝')}
`

export const LOGO_COMPACT = `  ${pc().bold(renderLogoLine('⚡ ZENITH'))} ${pc().dim('- Modern Reactive Framework')}`

const spinnerFrames = ['◐', '◓', '◑', '◒']
const dotSpinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export class Spinner {
    private interval: ReturnType<typeof setInterval> | null = null
    private frameIndex = 0
    private message: string
    private frames: string[]

    constructor(message: string, useDots: boolean = true) {
        this.message = message
        this.frames = useDots ? dotSpinnerFrames : spinnerFrames
    }

    start(): void {
        const mode = ui()
        if (!mode.animate) {
            console.log(`INFO: ${this.message}`)
            return
        }

        const write = (text: string) => {
            if (process.stdout?.write) {
                process.stdout.write(text)
            }
        }

        this.interval = setInterval(() => {
            const frame = pc().cyan(this.frames[this.frameIndex])
            write(`\r${frame} ${this.message}`)
            this.frameIndex = (this.frameIndex + 1) % this.frames.length
        }, 80)
    }

    stop(finalMessage?: string): void {
        if (this.interval) {
            clearInterval(this.interval)
            this.interval = null
        }

        if (ui().animate) {
            const write = (text: string) => {
                if (process.stdout?.write) {
                    process.stdout.write(text)
                }
            }
            write('\r' + ' '.repeat(this.message.length + 5) + '\r')
        }

        if (finalMessage) {
            console.log(finalMessage)
        }
    }

    succeed(message: string): void {
        this.stop(ui().plain ? `OK: ${message}` : `${pc().green('✓')} ${message}`)
    }

    fail(message: string): void {
        this.stop(ui().plain ? `ERROR: ${message}` : `${pc().red('✗')} ${message}`)
    }

    update(message: string): void {
        this.message = message
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export async function animateLogo(): Promise<void> {
    if (!ui().animate) {
        showCompactLogo()
        return
    }

    console.clear()
    console.log(pc().cyan('╔' + '═'.repeat(55) + '╗'))
    console.log(pc().cyan('║') + ' '.repeat(55) + pc().cyan('║'))

    for (const line of LOGO_LINES) {
        process.stdout.write(pc().cyan('║') + '  ')
        const chars = [...line]
        const chunkSize = Math.ceil(chars.length / 8)
        for (let j = 0; j < chars.length; j += chunkSize) {
            const chunk = chars.slice(j, j + chunkSize).join('')
            process.stdout.write(renderLogoLine(chunk))
            await sleep(30)
        }
        console.log('  ' + pc().cyan('║'))
    }

    console.log(pc().cyan('║') + ' '.repeat(55) + pc().cyan('║'))
    process.stdout.write(pc().cyan('║') + ' '.repeat(10))
    const taglineChars = [...TAGLINE]
    for (let i = 0; i < taglineChars.length; i += 4) {
        const chunk = taglineChars.slice(i, i + 4).join('')
        process.stdout.write(pc().dim(chunk))
        await sleep(20)
    }
    console.log(' '.repeat(10) + pc().cyan('║'))
    console.log(pc().cyan('║') + ' '.repeat(55) + pc().cyan('║'))
    console.log(pc().cyan('╚' + '═'.repeat(55) + '╝'))
    await sleep(150)
}

export function showLogo(): void {
    console.log(LOGO)
}

export function showCompactLogo(): void {
    if (ui().plain) {
        console.log('ZENITH - Modern Reactive Framework')
        return
    }
    console.log(LOGO_COMPACT)
}

export async function showCompletionAnimation(): Promise<void> {
    if (!ui().animate) {
        console.log('OK: Done!')
        return
    }

    const frames = ['✓', '✨', '✓', '✨', '✓']
    const colors = [pc().green, pc().yellow, pc().green, pc().yellow, pc().green]

    for (let i = 0; i < frames.length; i++) {
        process.stdout.write(`\r${colors[i](frames[i])} ${pc().bold('Done!')}`)
        await sleep(100)
    }
    console.log()
}

export function header(text: string): void {
    if (ui().plain) {
        console.log(`\nINFO: ${text}\n`)
        return
    }
    console.log(`\n${pc().bold(pc().cyan('▸'))} ${pc().bold(text)}\n`)
}

export function success(text: string): void {
    console.log(ui().plain ? `OK: ${text}` : `${pc().green('✓')} ${text}`)
}

export function error(text: string): void {
    console.log(ui().plain ? `ERROR: ${text}` : `${pc().red('✗')} ${text}`)
}

export function warn(text: string): void {
    console.log(ui().plain ? `WARN: ${text}` : `${pc().yellow('⚠')} ${text}`)
}

export function info(text: string): void {
    console.log(ui().plain ? `INFO: ${text}` : `${pc().blue('ℹ')} ${text}`)
}

export function step(num: number, text: string): void {
    if (ui().plain) {
        console.log(`STEP ${num}: ${text}`)
        return
    }
    console.log(`${pc().dim(`[${num}]`)} ${text}`)
}

export function highlight(text: string): string {
    return ui().plain ? text : pc().cyan(text)
}

export function dim(text: string): string {
    return ui().plain ? text : pc().dim(text)
}

export function bold(text: string): string {
    return ui().plain ? text : pc().bold(text)
}

export async function showIntro(): Promise<void> {
    await animateLogo()
}

export function showNextSteps(projectName: string, packageManager: string = 'bun'): void {
    const pm = packageManager
    const runCmd = pm === 'npm' ? 'npm run dev' : `${pm} run dev`

    if (ui().plain) {
        console.log('')
        console.log('NEXT STEPS:')
        console.log(`  cd ${projectName}`)
        console.log(`  ${runCmd}`)
        console.log('  open http://localhost:3000')
        console.log('')
        return
    }

    const cdLine = `cd ${projectName}`
    const maxLineLen = 45
    const cdPadding = Math.max(1, maxLineLen - cdLine.length - 6)
    const runPadding = Math.max(1, maxLineLen - runCmd.length - 6)

    console.log(`
${pc().cyan('┌' + '─'.repeat(50) + '┐')}
${pc().cyan('│')}${' '.repeat(50)}${pc().cyan('│')}
${pc().cyan('│')}   ${pc().green('✨')} ${pc().bold(renderLogoLine('Your Zenith app is ready!'))}${' '.repeat(17)}${pc().cyan('│')}
${pc().cyan('│')}${' '.repeat(50)}${pc().cyan('│')}
${pc().cyan('│')}   ${pc().dim('Next steps:')}${' '.repeat(36)}${pc().cyan('│')}
${pc().cyan('│')}${' '.repeat(50)}${pc().cyan('│')}
${pc().cyan('│')}   ${pc().cyan('$')} ${pc().bold(cdLine)}${' '.repeat(cdPadding)}${pc().cyan('│')}
${pc().cyan('│')}   ${pc().cyan('$')} ${pc().bold(runCmd)}${' '.repeat(runPadding)}${pc().cyan('│')}
${pc().cyan('│')}${' '.repeat(50)}${pc().cyan('│')}
${pc().cyan('│')}   ${pc().dim('Then open')} ${pc().underline(pc().blue('http://localhost:3000'))}${' '.repeat(9)}${pc().cyan('│')}
${pc().cyan('│')}${' '.repeat(50)}${pc().cyan('│')}
${pc().cyan('└' + '─'.repeat(50) + '┘')}
`)
}

export function showScaffoldSummary(projectName: string, templateLabel: string): void {
    const title = ui().plain ? 'SCAFFOLD PLAN' : pc().bold(pc().cyan('Scaffold Plan'))
    console.log(`\n${title}`)
    console.log(`Project : ${projectName}`)
    console.log(`Template: ${templateLabel}`)
}
