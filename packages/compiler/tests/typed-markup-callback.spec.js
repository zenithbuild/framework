/**
 * Regression test: TypeScript annotations must NOT leak into emitted browser JS
 *
 * When .zen source uses TypeScript type annotations in markup expression
 * callbacks (e.g. `.map((item: string) => ...)`), the emitted JS must
 * NOT contain those annotations. Type annotations are not valid JavaScript
 * and cause `SyntaxError: Unexpected token ':'` in browsers.
 *
 * This test operates at the bundler output level — it scans all emitted JS
 * page chunks for patterns like `(param: string)` or `(param: any)` inside
 * expression function closures.
 *
 * Root cause: the compiler strips TS from <script> blocks but markup
 * expressions pass through the bundler's expression-function emitter
 * without stripping. The source-level workaround is to avoid TS annotations
 * in markup callbacks; the proper fix is compiler/bundler-level stripping.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Resolve site dist relative to monorepo root
const SITE_DIST = path.resolve(__dirname, '../../../site/dist/assets')

// Pattern matches TypeScript type annotations in arrow-function callback params
// e.g. `(item: string) =>`, `(record: any, index: number) =>`
const TS_ANNOTATION_IN_CALLBACK = /\(\w+:\s*(string|number|any|boolean|object|unknown|never|void|Array|Record)\b[^)]*\)\s*=>/g

test('emitted page chunks: no TypeScript annotations in expression functions', () => {
  if (!fs.existsSync(SITE_DIST)) {
    // Skip if site hasn't been built (CI may not build site in this test suite)
    return
  }

  const jsFiles = fs.readdirSync(SITE_DIST)
    .filter(f => f.endsWith('.js'))
    // Skip vendor/runtime/router — only check page chunks
    .filter(f => !f.startsWith('vendor.') && !f.startsWith('runtime.') && !f.startsWith('router.'))

  const violations = []

  for (const file of jsFiles) {
    const content = fs.readFileSync(path.join(SITE_DIST, file), 'utf8')
    let match
    while ((match = TS_ANNOTATION_IN_CALLBACK.exec(content)) !== null) {
      // Only flag matches inside expression function closures
      // (after `function(__ctx)` pattern, which is the bundler's expression wrapper)
      const lineStart = content.lastIndexOf('\n', match.index) + 1
      const lineEnd = content.indexOf('\n', match.index)
      const line = content.substring(lineStart, lineEnd === -1 ? undefined : lineEnd)

      if (line.includes('function(__ctx)') || line.includes('__zenith_fn')) {
        violations.push({
          file,
          match: match[0],
          context: line.substring(0, 200)
        })
      }
    }
  }

  assert.equal(
    violations.length,
    0,
    `TypeScript annotations found in emitted browser JS:\n${violations.map(v =>
      `  ${v.file}: ${v.match}`
    ).join('\n')}`
  )
})

test('emitted page chunks: all pass node syntax check', () => {
  if (!fs.existsSync(SITE_DIST)) {
    return
  }


  const jsFiles = fs.readdirSync(SITE_DIST).filter(f => f.endsWith('.js'))
  const failures = []

  for (const file of jsFiles) {
    const fullPath = path.join(SITE_DIST, file)
    const result = spawnSync(process.execPath, ['--check', fullPath], {
      encoding: 'utf8',
      timeout: 10000
    })
    if (result.status !== 0) {
      failures.push({ file, error: (result.stderr || '').substring(0, 300) })
    }
  }

  assert.equal(
    failures.length,
    0,
    `Emitted JS files with syntax errors:\n${failures.map(f =>
      `  ${f.file}: ${f.error}`
    ).join('\n')}`
  )
})
