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
  assert.deepEqual(Object.keys(compiler), ['compile'])
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
    '@zenithbuild/',
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
  assert.deepEqual(pkg.exports, { '.': './dist/index.js' })

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
