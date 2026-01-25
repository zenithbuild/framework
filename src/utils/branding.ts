/**
 * Zenith CLI Branding
 * 
 * ASCII art logo, colors, animations, and styled output
 */

import pc from 'picocolors'

// Brand colors
export const colors = {
    primary: pc.blue,
    secondary: pc.cyan,
    success: pc.green,
    warning: pc.yellow,
    error: pc.red,
    muted: pc.gray,
    bold: pc.bold,
    dim: pc.dim
}

// ASCII Zenith logo
export const LOGO = `
${pc.cyan('╔═══════════════════════════════════════════════════════════╗')}
${pc.cyan('║')}                                                           ${pc.cyan('║')}
${pc.cyan('║')}   ${pc.bold(pc.blue('███████╗'))}${pc.bold(pc.cyan('███████╗'))}${pc.bold(pc.blue('███╗   ██╗'))}${pc.bold(pc.cyan('██╗'))}${pc.bold(pc.blue('████████╗'))}${pc.bold(pc.cyan('██╗  ██╗'))}   ${pc.cyan('║')}
${pc.cyan('║')}   ${pc.bold(pc.blue('╚══███╔╝'))}${pc.bold(pc.cyan('██╔════╝'))}${pc.bold(pc.blue('████╗  ██║'))}${pc.bold(pc.cyan('██║'))}${pc.bold(pc.blue('╚══██╔══╝'))}${pc.bold(pc.cyan('██║  ██║'))}   ${pc.cyan('║')}
${pc.cyan('║')}   ${pc.bold(pc.blue('  ███╔╝ '))}${pc.bold(pc.cyan('█████╗  '))}${pc.bold(pc.blue('██╔██╗ ██║'))}${pc.bold(pc.cyan('██║'))}${pc.bold(pc.blue('   ██║   '))}${pc.bold(pc.cyan('███████║'))}   ${pc.cyan('║')}
${pc.cyan('║')}   ${pc.bold(pc.blue(' ███╔╝  '))}${pc.bold(pc.cyan('██╔══╝  '))}${pc.bold(pc.blue('██║╚██╗██║'))}${pc.bold(pc.cyan('██║'))}${pc.bold(pc.blue('   ██║   '))}${pc.bold(pc.cyan('██╔══██║'))}   ${pc.cyan('║')}
${pc.cyan('║')}   ${pc.bold(pc.blue('███████╗'))}${pc.bold(pc.cyan('███████╗'))}${pc.bold(pc.blue('██║ ╚████║'))}${pc.bold(pc.cyan('██║'))}${pc.bold(pc.blue('   ██║   '))}${pc.bold(pc.cyan('██║  ██║'))}   ${pc.cyan('║')}
${pc.cyan('║')}   ${pc.bold(pc.blue('╚══════╝'))}${pc.bold(pc.cyan('╚══════╝'))}${pc.bold(pc.blue('╚═╝  ╚═══╝'))}${pc.bold(pc.cyan('╚═╝'))}${pc.bold(pc.blue('   ╚═╝   '))}${pc.bold(pc.cyan('╚═╝  ╚═╝'))}   ${pc.cyan('║')}
${pc.cyan('║')}                                                           ${pc.cyan('║')}
${pc.cyan('║')}       ${pc.dim('The Modern Reactive Web Framework')}                  ${pc.cyan('║')}
${pc.cyan('║')}                                                           ${pc.cyan('║')}
${pc.cyan('╚═══════════════════════════════════════════════════════════╝')}
`

// Compact logo for smaller spaces
export const LOGO_COMPACT = `
  ${pc.bold(pc.blue('⚡'))} ${pc.bold(pc.cyan('ZENITH'))} ${pc.dim('- Modern Reactive Framework')}
`

// Spinner frames for animations
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export class Spinner {
    private interval: ReturnType<typeof setInterval> | null = null
    private frameIndex = 0
    private message: string

    constructor(message: string) {
        this.message = message
    }

    start() {
        this.interval = setInterval(() => {
            process.stdout.write(`\r${pc.cyan(spinnerFrames[this.frameIndex])} ${this.message}`)
            this.frameIndex = (this.frameIndex + 1) % spinnerFrames.length
        }, 80)
    }

    stop(finalMessage?: string) {
        if (this.interval) {
            clearInterval(this.interval)
            this.interval = null
        }
        process.stdout.write('\r' + ' '.repeat(this.message.length + 5) + '\r')
        if (finalMessage) {
            console.log(finalMessage)
        }
    }

    succeed(message: string) {
        this.stop(`${pc.green('✓')} ${message}`)
    }

    fail(message: string) {
        this.stop(`${pc.red('✗')} ${message}`)
    }
}

// Styled output functions
export function showLogo() {
    console.log(LOGO)
}

export function showCompactLogo() {
    console.log(LOGO_COMPACT)
}

export function header(text: string) {
    console.log(`\n${pc.bold(pc.cyan('▸'))} ${pc.bold(text)}\n`)
}

export function success(text: string) {
    console.log(`${pc.green('✓')} ${text}`)
}

export function error(text: string) {
    console.log(`${pc.red('✗')} ${text}`)
}

export function warn(text: string) {
    console.log(`${pc.yellow('⚠')} ${text}`)
}

export function info(text: string) {
    console.log(`${pc.blue('ℹ')} ${text}`)
}

export function step(num: number, text: string) {
    console.log(`${pc.dim(`[${num}]`)} ${text}`)
}

export function highlight(text: string): string {
    return pc.cyan(text)
}

export function dim(text: string): string {
    return pc.dim(text)
}

export function bold(text: string): string {
    return pc.bold(text)
}

// Animated intro (optional)
export async function showIntro() {
    console.clear()
    showLogo()
    await sleep(300)
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// Next steps box
export function showNextSteps(projectName: string) {
    console.log(`
${pc.cyan('┌─────────────────────────────────────────────────────────┐')}
${pc.cyan('│')}                                                         ${pc.cyan('│')}
${pc.cyan('│')}   ${pc.green('✨')} ${pc.bold('Your Zenith app is ready!')}                         ${pc.cyan('│')}
${pc.cyan('│')}                                                         ${pc.cyan('│')}
${pc.cyan('│')}   ${pc.dim('Next steps:')}                                          ${pc.cyan('│')}
${pc.cyan('│')}                                                         ${pc.cyan('│')}
${pc.cyan('│')}   ${pc.cyan('$')} ${pc.bold(`cd ${projectName}`)}${' '.repeat(Math.max(0, 40 - projectName.length))}${pc.cyan('│')}
${pc.cyan('│')}   ${pc.cyan('$')} ${pc.bold('bun run dev')}                                       ${pc.cyan('│')}
${pc.cyan('│')}                                                         ${pc.cyan('│')}
${pc.cyan('│')}   ${pc.dim('Then open')} ${pc.underline(pc.blue('http://localhost:3000'))}                  ${pc.cyan('│')}
${pc.cyan('│')}                                                         ${pc.cyan('│')}
${pc.cyan('└─────────────────────────────────────────────────────────┘')}
`)
}

/**
 * Show dev server startup panel
 */
export function showServerPanel(options: {
    project: string,
    pages: string,
    url: string,
    hmr: boolean,
    mode: string
}) {
    console.clear()
    console.log(LOGO_COMPACT)
    console.log(`${pc.cyan('────────────────────────────────────────────────────────────')}`)
    console.log(` ${pc.magenta('🟣 Zenith Dev Server')}`)
    console.log(`${pc.cyan('────────────────────────────────────────────────────────────')}`)
    console.log(` ${pc.bold('Project:')}  ${pc.dim(options.project)}`)
    console.log(` ${pc.bold('Pages:')}    ${pc.dim(options.pages)}`)
    console.log(` ${pc.bold('Mode:')}     ${pc.cyan(options.mode)} ${pc.dim(`(${options.hmr ? 'HMR enabled' : 'HMR disabled'})`)}`)
    console.log(`${pc.cyan('────────────────────────────────────────────────────────────')}`)
    console.log(` ${pc.bold('Server:')}   ${pc.cyan(pc.underline(options.url))} ${pc.dim('(clickable)')}`)
    console.log(` ${pc.bold('Hot Reload:')} ${options.hmr ? pc.green('Enabled ✅') : pc.red('Disabled ✗')}`)
    console.log(`${pc.cyan('────────────────────────────────────────────────────────────')}`)
    console.log(` ${pc.dim('Press Ctrl+C to stop')}\n`)
}
