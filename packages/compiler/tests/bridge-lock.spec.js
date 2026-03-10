import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as compiler from '../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, files)
    } else {
      files.push(fullPath)
    }
  }
  return files
}

test('public API surface is frozen', () => {
  assert.deepEqual(Object.keys(compiler).sort(), ['compile', 'resolveCompilerBin'])
})

test('bridge source has no forbidden primitives', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'dist', 'index.js'), 'utf8')
  const forbidden = [
    'eval(',
    'new Function',
    'Date(',
    'Math.random(',
    'process.env'
  ]

  for (const token of forbidden) {
    assert.equal(source.includes(token), false, `forbidden token found: ${token}`)
  }
})

test('bridge source has no forbidden layer imports', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'dist', 'index.js'), 'utf8')
  const forbidden = [
    'bundler',
    'runtime',
    'router',
    'cli'
  ]

  for (const token of forbidden) {
    assert.equal(source.includes(token), false, `forbidden layer reference found: ${token}`)
  }
})

test('only dist/index.js is exported', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
  assert.deepEqual(pkg.exports, {
    '.': './dist/index.js',
    './package.json': './package.json'
  })

  const distDir = path.join(projectRoot, 'dist')
  const distFiles = walk(distDir)
    .map((f) => path.relative(distDir, f))
    .filter((f) => !f.startsWith('.'))
    .sort()

  assert.deepEqual(distFiles, ['index.js'])
})

test('compile is deterministic for identical input', () => {
  const fixturePath = path.join(projectRoot, 'tests', 'fixture.zen')
  const first = compiler.compile(fixturePath)
  const second = compiler.compile(fixturePath)

  assert.deepEqual(first, second)
})

test('compiler JSON contract: schemaVersion and warnings array exist', () => {
  const fixturePath = path.join(projectRoot, 'tests', 'fixture.zen')
  const result = compiler.compile(fixturePath)

  assert.ok('schemaVersion' in result, 'JSON must include schemaVersion for LSP branching')
  assert.equal(result.schemaVersion, 1, 'schemaVersion must be 1')
  assert.ok('warnings' in result, 'JSON must include warnings key')
  assert.ok(Array.isArray(result.warnings), 'warnings must be an array')
  assert.ok('diagnostics' in result, 'JSON must include diagnostics key')
  assert.ok(Array.isArray(result.diagnostics), 'diagnostics must be an array')

  for (const w of result.warnings) {
    assert.ok('code' in w, `warning must have code: ${JSON.stringify(w)}`)
    assert.ok('message' in w, `warning must have message: ${JSON.stringify(w)}`)
    assert.ok('severity' in w, `warning must have severity: ${JSON.stringify(w)}`)
    assert.ok('range' in w, `warning must have range: ${JSON.stringify(w)}`)
    assert.ok(w.range && 'start' in w.range, `warning.range must have start: ${JSON.stringify(w)}`)
    assert.ok(w.range && 'end' in w.range, `warning.range must have end: ${JSON.stringify(w)}`)
  }
})

test('compiler JSON contract: warnings shape when warnings exist', () => {
  const source = '<script lang="ts">\nconst el = document.querySelector(".x");\n</script>\n<div class="x"></div>'
  const result = compiler.compile(source, '/tmp/test.zen')

  assert.ok(result.warnings.length >= 1, 'querySelector should produce ZEN-DOM-QUERY warning')
  const w = result.warnings[0]
  assert.equal(w.code, 'ZEN-DOM-QUERY')
  assert.ok(typeof w.message === 'string')
  assert.ok(w.range.start.line >= 1 && w.range.start.column >= 1)
  assert.ok(w.range.end.line >= 1 && w.range.end.column >= 1)

  const diagnostic = result.diagnostics[0]
  assert.equal(diagnostic.code, 'ZEN-DOM-QUERY')
  assert.equal(diagnostic.source, 'compiler')
  assert.equal(diagnostic.severity, 'warning')
  assert.ok(typeof diagnostic.docsPath === 'string')
})

test('compiler bridge returns structured diagnostics for hard failures', () => {
  const result = compiler.compile('<script>const x = 1</script><main>{x}</main>', '/tmp/invalid-script.zen')

  assert.equal(result.schemaVersion, 1)
  assert.deepEqual(result.warnings, [])
  assert.ok(Array.isArray(result.diagnostics))
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].code, 'ZEN-SCRIPT-MISSING-TS')
  assert.equal(result.diagnostics[0].severity, 'error')
  assert.equal(result.diagnostics[0].source, 'compiler')
  assert.ok(typeof result.diagnostics[0].suggestion === 'string')
})
