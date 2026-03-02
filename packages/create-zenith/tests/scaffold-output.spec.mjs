import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CLI_PATH = resolve(process.cwd(), 'dist', 'cli.js')
const ANSI_REGEX = /\x1b\[[0-9;]*m/g

test('scaffold output is deterministic in plain mode', () => {
    assert.equal(existsSync(CLI_PATH), true, 'dist/cli.js missing; run npm run build first')
    const cwd = mkdtempSync(join(tmpdir(), 'create-zenith-ui-output-'))
    const appName = 'gate5-demo-app'

    try {
        const result = spawnSync(
            process.execPath,
            [CLI_PATH, appName, '--with-tailwind'],
            {
                cwd,
                encoding: 'utf8',
                env: {
                    ...process.env,
                    ZENITH_NO_UI: '1',
                    CI: '1',
                    NO_COLOR: '1',
                    CREATE_ZENITH_TEMPLATE_MODE: 'local',
                    CREATE_ZENITH_SKIP_INSTALL: '1'
                }
            }
        )

        assert.equal(result.status, 0, result.stderr || result.stdout)
        const output = `${result.stdout}${result.stderr}`.replace(/\r/g, '')
        assert.equal(ANSI_REGEX.test(output), false)
        assert.match(output, /SCAFFOLD PLAN/)
        assert.match(output, /Project : gate5-demo-app/)
        assert.match(output, /Template: starter-tailwindcss/)
        assert.match(output, /NEXT STEPS:/)

        assert.match(output, /^ZENITH - Modern Reactive Framework/m)
    } finally {
        rmSync(cwd, { recursive: true, force: true })
    }
})
