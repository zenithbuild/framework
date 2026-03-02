# @zenithbuild/compiler API Reference

The Zenith Compiler is the mechanical authority of the workspace. It enforces the Zenith Contract and transforms `.zen` files into highly optimized, symbolic output.

## Core Functions

### `compile(source: string, filePath: string, options?: ZenCompileOptions): Promise<ZenCompileResult>`
The primary entry point for compiling Zenith source code.

- **`source`**: The raw `.zen` file content.
- **`filePath`**: Virtual path used for error reporting and relative resolution.
- **`options`**:
    - `components`: A Map of pre-resolved component metadata (optional).

**Returns**:
- `ir`: The internal representation (ZenIR).
- `compiled`: The transformed template structure.
- `finalized`: The final JavaScript/HTML/CSS bundle ready for emission.

### `parseZenFile(filePath: string, source: string): ZenIR`
Native-bridge function that performs initials lexical and syntactic analysis. Returns the Raw IR.

### `validateIr(ir: ZenIR): void`
Enforces all Zenith Invariants. Throws if any contract violation is detected (e.g., `Z-ERR-REF-001`).

### `transformTemplate(ir: ZenIR): CompiledTemplate`
Lowers the IR into a symbolic template structure, stripping all runtime abstractions.

## Types

### `ZenIR`
The raw, cross-language representation of a Zenith component.

### `ZenCompileResult`
```ts
{
  ir: ZenIR;
  compiled: CompiledTemplate;
  finalized?: FinalizedOutput;
}
```

## Compiler Invariants (The Guard)
The compiler strictly enforces these invariants during the `validateIr` phase:
1. **Mechanical Certainty**: All identifiers must be resolvable.
2. **Deterministic Identity**: Symbolic handles for event listeners.
3. **No Executable Leaks**: Forbidden logic in template attributes.
