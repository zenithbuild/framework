import { describe, it, expect } from 'bun:test'
import * as Compiler from '../index'

describe('Compiler Entry Surface', () => {
    it('exports only compile and types', () => {
        const exports = Object.keys(Compiler)
        // Primary export
        expect(exports).toContain('compile')

        // Strict Ban List (Orchestration/FS logic)
        expect(exports).not.toContain('buildSSG')
        expect(exports).not.toContain('buildSPA')
        expect(exports).not.toContain('discoverComponents')
        expect(exports).not.toContain('bundlePageScript')
        expect(exports).not.toContain('compileZen') // The file-reader one
    })

    it('compiles a simple component', async () => {
        const source = `<script setup lang="ts">
    prop title: string
    </script>
    <h1>{title}</h1>`

        // pure compile(source, path)
        const result = await Compiler.compile(source, 'test.zen')

        expect(result.ir).toBeDefined()
        expect(result.compiled).toBeDefined()
        expect(result.finalized).toBeDefined()
        // Output structure check
        expect(result.finalized?.html).toBeTruthy()
    })
})
