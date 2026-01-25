/**
 * @zenithbuild/cli - Logger Utility
 * 
 * Colored console output for CLI feedback
 */

import pc from 'picocolors'

export function log(message: string): void {
    console.log(`${pc.cyan('[zenith]')} ${message}`)
}

export function success(message: string): void {
    console.log(`${pc.green('✓')} ${message}`)
}

export function warn(message: string): void {
    console.log(`${pc.yellow('⚠')} ${message}`)
}

export function error(message: string): void {
    console.error(`${pc.red('✗')} ${message}`)
}

export function info(message: string): void {
    console.log(`${pc.blue('ℹ')} ${message}`)
}

export function header(title: string): void {
    console.log(`\n${pc.bold(pc.cyan(title))}\n`)
}

export function hmr(type: 'CSS' | 'Page' | 'Layout' | 'Content', path: string): void {
    console.log(`${pc.magenta('[HMR]')} ${pc.bold(type)} updated: ${pc.dim(path)}`)
}

export function route(method: string, path: string, status: number, totalMs: number, compileMs: number, renderMs: number): void {
    const statusColor = status < 400 ? pc.green : pc.red
    const timeColor = totalMs > 1000 ? pc.yellow : pc.gray

    console.log(
        `${pc.bold(method)} ${pc.cyan(path.padEnd(15))} ` +
        `${statusColor(status)} ${pc.dim('in')} ${timeColor(`${totalMs}ms`)} ` +
        `${pc.dim(`(compile: ${compileMs}ms, render: ${renderMs}ms)`)}`
    )
}
