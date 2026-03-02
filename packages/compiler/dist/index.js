import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Compile Zenith source.
 *
 * Back-compat: compile(filePath) reads from file.
 * New mode: compile({ source, filePath }) or compile(source, filePath) uses stdin.
 *
 * @param {string|{ source: string, filePath: string }} entryPathOrSource - File path, or source string, or { source, filePath }
 * @param {string|object} [filePathOrOptions] - File path (when first arg is source string), or options (ignored)
 * @returns {object} Parsed JSON output (includes warnings array)
 */
export function compile(entryPathOrSource, filePathOrOptions = {}) {
  const bin = path.resolve(__dirname, '../target/release/zenith-compiler')
  let args
  let spawnOpts = { encoding: 'utf8' }

  if (typeof entryPathOrSource === 'object' && entryPathOrSource !== null && 'source' in entryPathOrSource && 'filePath' in entryPathOrSource) {
    args = ['--stdin', entryPathOrSource.filePath]
    spawnOpts.input = entryPathOrSource.source
  } else if (typeof entryPathOrSource === 'string' && typeof filePathOrOptions === 'string') {
    args = ['--stdin', filePathOrOptions]
    spawnOpts.input = entryPathOrSource
  } else {
    args = [entryPathOrSource]
  }

  const result = spawnSync(bin, args, spawnOpts)

  if (result.status !== 0) {
    throw new Error(result.stderr || 'Compiler execution failed')
  }

  return JSON.parse(result.stdout)
}
