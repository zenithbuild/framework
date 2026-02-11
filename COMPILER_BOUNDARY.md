# COMPILER BOUNDARY FREEZE

> This document is a binding contract. The compiler must never violate these boundaries.

## The Compiler WILL NOT:

1. **Resolve components** — Tag names are opaque strings. No lookup. No registry.
2. **Inline components** — No component expansion at compile time.
3. **Interpret children as slots** — Children are `Vec<Node>`. Nothing more.
4. **Inject runtime wrappers** — Output is static strings + expression table.
5. **Add reactive proxies** — No `signal()`, `proxy()`, `observe()`.
6. **Generate virtual DOM** — No `h()`, `createElement()`, `vnode`.
7. **Perform tree shaking** — Compiler emits everything. Bundler decides.
8. **Perform bundling** — Compiler outputs per-file. No concatenation.
9. **Do module resolution** — No `import`. No `require`. No path resolution.
10. **Normalize whitespace** — Preserve exactly as written.
11. **Normalize tag structure** — `<X></X>` stays `<X></X>`. `<X />` stays `<X />`.
12. **Sort or reorder attributes** — Source order is sacred.
13. **Evaluate expressions** — Expression strings are opaque. No interpretation.

## The Compiler WILL:

1. **Lex** input into tokens.
2. **Parse** tokens into AST (Element, Text, Expression).
3. **Transform** AST to extract expressions into an indexed table.
4. **Generate** deterministic output: HTML string + expression table + `setup()`.
5. **Fail fast** on malformed input with precise error messages.
6. **Produce identical output** for identical input, always.

## Output Contract

Every compiled file emits exactly:
```ts
export const __zenith_expr = [/* expressions */]
export function setup() { return {} }
export default `<html string>`
```

Three exports. No more. No less.

## Boundary Tests

These boundaries are enforced by:
- `tests/zero_semantics.rs` (no imports, no resolution, no runtime behavior)
- `tests/invariants.rs` (structural preservation)
- `tests/codegen_stability.rs` (byte-stable output)
- `tests/error_system.rs` (fail-fast guarantees)
