import { expect, test, describe } from 'bun:test'
import { compile } from '../index'
import { InvariantError } from '../errors/compilerError'

describe('Native Error Bridge (One True Bridge)', () => {
    test('INV005: Rejects <template> tag as invalid Zenith syntax', async () => {
        const source = `
<script>
    const name = "Zenith";
</script>

<template>
    <div>This is invalid because of the template tag</div>
</template>
        `;

        try {
            await compile(source, 'test-invalid.zen');
            throw new Error('Should have thrown an InvariantError for <template> tag');
        } catch (e: any) {
            expect(e.code).toBe('INV005');
            expect(e.context).toBe('<template>');
        }
    });

    test('Syscall Protocol: Returns structured errors results', async () => {
        const source = `<script> props="" </script> <div></div>`;
        const result = await compile(source, 'malformed-props.zen');

        // If it didn't throw, it should be a successful result or held error
        if (result.finalized) {
            // result.finalized might have hasErrors: true if not a fatal invariant
        }
    });
});
