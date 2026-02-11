import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function compile(entryPath, options = {}) {
  const bin = path.resolve(__dirname, '../target/release/zenith-compiler')
  const args = [entryPath]

  const result = spawnSync(bin, args, {
    encoding: 'utf8'
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || 'Compiler execution failed')
  }

  return JSON.parse(result.stdout)
}
