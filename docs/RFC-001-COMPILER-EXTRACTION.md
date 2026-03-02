# RFC-001: Compiler Extraction & Public API Specification

**Status:** Draft  
**Author:** Zenith Core Team  
**Created:** January 17, 2026  
**Target Version:** 2.0.0

---

## Summary

This RFC proposes the extraction of the Zenith compiler into a standalone package (`@zenithbuild/compiler`) with a formally specified public API and runtime contract.

---

## Motivation

The Zenith compiler currently lives within `@zenithbuild/core` alongside the CLI, runtime, and utilities. This coupling creates several problems:

1. **Versioning Conflicts:** Compiler changes require full core releases
2. **Testing Complexity:** Cannot test compiler in isolation
3. **Runtime Coupling:** Implicit contracts between compiler output and runtime
4. **Philosophy Violations:** Runtime has structural authority that should belong to compiler

### Goals

- Define a stable, versioned compiler public API
- Establish formal contract between compiler output and runtime input
- Enable independent compiler development and testing
- Enforce "Compiler-Owned Structure" principle at the package boundary

### Non-Goals

- Changing the `.zen` file format
- Modifying the expression binding system
- Adding new template features

---

## Detailed Design

### Package Structure

```
@zenithbuild/compiler-types   # Shared types (IR, Output, Invariants)
@zenithbuild/compiler         # Core compilation logic
@zenithbuild/runtime          # Hydration and reactivity (separate RFC)
@zenithbuild/cli              # Command orchestration
@zenithbuild/core        # Meta-package, re-exports all
```

### Compiler Public API

```typescript
// @zenithbuild/compiler/index.ts

/**
 * Compile a .zen file to static output
 */
export function compileZen(
    filePath: string,
    options?: CompileOptions
): Promise<CompilerOutput>;

/**
 * Compile .zen source string
 */
export function compileZenSource(
    source: string,
    filePath: string,
    options?: CompileOptions
): Promise<CompilerOutput>;

/**
 * Parse .zen source to IR (for tooling)
 */
export function parseZen(
    source: string,
    filePath: string
): ZenIR;

/**
 * Validate IR against invariants
 */
export function validateIR(
    ir: ZenIR,
    filePath: string
): ValidationResult;

/**
 * Transform IR to output (for custom pipelines)
 */
export function transformIR(
    ir: ZenIR,
    options?: TransformOptions
): Promise<CompilerOutput>;
```

### Compile Options

```typescript
export interface CompileOptions {
    /**
     * Directory containing component definitions
     */
    componentsDir?: string;
    
    /**
     * Output mode
     * - 'ssr': Pre-render with hydration markers (default)
     * - 'ssg': Static generation, no runtime
     * - 'spa': Client-side only, minimal SSR
     */
    mode?: 'ssr' | 'ssg' | 'spa';
    
    /**
     * Target environment
     * - 'browser': Standard browser (default)
     * - 'bun': Bun runtime optimizations
     */
    target?: 'browser' | 'bun';
    
    /**
     * Enable source maps
     */
    sourceMaps?: boolean;
    
    /**
     * Minify output
     */
    minify?: boolean;
}
```

### Compiler Output Contract

```typescript
// @zenithbuild/compiler-types/output.ts

/**
 * Complete compiler output — the ONLY interface between compiler and runtime
 */
export interface CompilerOutput {
    /**
     * Static HTML with hydration markers (data-zen-*)
     */
    html: string;
    
    /**
     * JavaScript bundle containing:
     * - Expression evaluator definitions
     * - Expression registry initialization
     * - Style injection
     * - Auto-hydration bootstrap
     */
    js: string;
    
    /**
     * Extracted style blocks
     */
    styles: string[];
    
    /**
     * Structured binding metadata (for tooling/debugging)
     */
    bindings: BindingDefinition[];
    
    /**
     * Structured expression metadata (for tooling/debugging)
     */
    expressions: ExpressionDefinition[];
    
    /**
     * Compilation errors (empty if successful)
     */
    errors: CompilerError[];
    
    /**
     * Whether compilation succeeded
     */
    success: boolean;
}

/**
 * Expression definition — runtime evaluator contract
 */
export interface ExpressionDefinition {
    /**
     * Unique identifier (e.g., "expr_0")
     */
    id: string;
    
    /**
     * Original expression code (for debugging)
     */
    code: string;
    
    /**
     * Source location
     */
    location: SourceLocation;
    
    /**
     * Data dependencies detected at compile time
     */
    dependencies: ExpressionDependencies;
    
    /**
     * Loop context if inside .map() iteration
     */
    loopContext?: LoopContext;
}

/**
 * Binding definition — DOM marker contract
 */
export interface BindingDefinition {
    /**
     * Unique identifier matching data-zen-* attribute
     */
    id: string;
    
    /**
     * Binding type
     */
    type: 'text' | 'attribute' | 'html' | 'loop' | 'conditional' | 'optional';
    
    /**
     * DOM marker attribute (e.g., "data-zen-text", "class")
     */
    target: string;
    
    /**
     * Referenced expression ID
     */
    expressionId: string;
    
    /**
     * Additional metadata for complex bindings
     */
    meta?: LoopMeta | ConditionalMeta;
}
```

### Intermediate Representation (IR)

```typescript
// @zenithbuild/compiler-types/ir.ts

/**
 * Complete IR for a .zen file
 */
export interface ZenIR {
    filePath: string;
    template: TemplateIR;
    script: ScriptIR | null;
    styles: StyleIR[];
    componentScripts?: ComponentScriptIR[];
}

/**
 * Template IR — parsed and lowered template
 */
export interface TemplateIR {
    raw: string;
    nodes: TemplateNode[];
    expressions: ExpressionIR[];
}

/**
 * All possible template node types
 */
export type TemplateNode =
    | ElementNode
    | TextNode
    | ExpressionNode
    | ComponentNode
    | ConditionalFragmentNode
    | OptionalFragmentNode
    | LoopFragmentNode;
```

### Invariant Definitions

```typescript
// @zenithbuild/compiler-types/invariants.ts

/**
 * Invariant codes — must be enforced by compiler
 */
export const INVARIANT = {
    // Structural Invariants
    LOOP_CONTEXT_LOST: 'INV001',
    ATTRIBUTE_NOT_FORWARDED: 'INV002',
    UNRESOLVED_COMPONENT: 'INV003',
    REACTIVE_BOUNDARY: 'INV004',
    TEMPLATE_TAG: 'INV005',
    SLOT_ATTRIBUTE: 'INV006',
    ORPHAN_COMPOUND: 'INV007',
    NON_ENUMERABLE_JSX: 'INV008',
    
    // Expression Invariants
    EXPR_UNREGISTERED: 'INV-EXPR-001',
    EXPR_RAW_IN_OUTPUT: 'INV-EXPR-002',
    EXPR_INVALID_SYNTAX: 'INV-EXPR-003',
    
    // Output Invariants
    OUTPUT_RAW_EXPRESSION: 'INV-OUT-001',
    OUTPUT_UNRESOLVED_BINDING: 'INV-OUT-002',
} as const;

export type InvariantCode = typeof INVARIANT[keyof typeof INVARIANT];

/**
 * Invariant violation error
 */
export class InvariantError extends Error {
    constructor(
        public readonly code: InvariantCode,
        public readonly message: string,
        public readonly guarantee: string,
        public readonly filePath: string,
        public readonly line: number,
        public readonly column: number
    ) {
        super(`[${code}] ${message}`);
        this.name = 'InvariantError';
    }
}
```

---

## Runtime Contract

The runtime MUST NOT:

1. Create DOM nodes (except for loop item cloning — see exception below)
2. Interpret expression code directly
3. Resolve component definitions
4. Own reactive boundaries
5. Modify compiler-generated structure (except visibility)

The runtime MAY:

1. Clone pre-compiled template fragments for loop items
2. Toggle visibility via `display: none/contents`
3. Update text content via `textContent`
4. Update attributes via `setAttribute`
5. Attach event listeners to compiler-marked elements
6. Evaluate registered expression functions by ID

### Loop Hydration Exception

Dynamic lists require runtime DOM creation. This is an **accepted exception** to "Compiler-Owned Structure" with constraints:

1. Template structure is compiler-defined (cloned, not interpreted)
2. Runtime only calls `cloneNode(true)` on compiler-provided template
3. Runtime attaches scope via `_zen_scope` property
4. Runtime calls `scanBindings()` on cloned subtree
5. No runtime interpretation of loop syntax

---

## Migration Path

### Phase 1: Type Extraction (v1.3.0)

1. Create `@zenithbuild/compiler-types` package
2. Move IR types, Output types, Invariant definitions
3. Update imports in `@zenithbuild/core`

### Phase 2: Compiler Extraction (v0.5.0-beta.2.19)

1. Create `@zenithbuild/compiler` package
2. Move parse/, transform/, validate/, finalize/
3. Export public API as specified
4. Keep internal functions private

### Phase 3: Runtime Separation (v1.5.0)

1. Create `@zenithbuild/runtime` package
2. Runtime depends only on `@zenithbuild/compiler-types`
3. Verify with integration tests

### Phase 4: Core Simplification (v2.0.0)

1. `@zenithbuild/core` becomes meta-package
2. Re-exports from child packages
3. CLI uses public APIs only

---

## Alternatives Considered

### Alternative A: Keep Monorepo

**Pros:** Simpler versioning, easier refactoring  
**Cons:** Coupling persists, philosophy violations unenforceable

**Decision:** Rejected — extraction is necessary for long-term health

### Alternative B: Full Static Compilation (No Runtime Loop Creation)

**Pros:** Pure "Compiler-Owned Structure"  
**Cons:** Cannot handle dynamic lists without predefined max

**Decision:** Rejected as impractical — accept loop exception with constraints

### Alternative C: Virtual DOM Reconciliation

**Pros:** Handles all dynamic scenarios  
**Cons:** Violates "Zero Runtime Abstractions"

**Decision:** Rejected — fundamentally incompatible with philosophy

---

## Open Questions

1. **Should expression evaluators be pre-compiled or use `new Function()`?**
   - Current: `new Function()` with `with` statement
   - Alternative: Pre-compiled closures (requires different bundling)

2. **How to handle component styles in extracted compiler?**
   - Current: Collected and inlined
   - Alternative: CSS extraction to separate files

3. **Should the compiler support incremental compilation?**
   - Current: Full recompilation on change
   - Alternative: Cache IR, only recompile changed portions

---

## References

- [Zenith Framework Philosophy](../PHILOSOPHY.md)
- [Systems Verification Report](./SYSTEMS_VERIFICATION_REPORT.md)
- [Expression Registration Invariant](../zenith-core/compiler/validate/invariants.ts)

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-01-17 | Opus | Initial draft |
