# Zenith Public Specification

> [!IMPORTANT]
> **Precedence Rule**: If any code, comment, or document conflicts with this specification, **this document is authoritative**. Conflicting code must be changed or deleted.

## 1. Zenith Guarantees

Zenith guarantees the following properties for all valid programs:

1.  **Mechanical Certainty**: All behavior is statically analyzable at compile time. There is no runtime guessing.
2.  **Zero Runtime Abstraction**: The output contains no Virtual DOM, no reactive proxies, no "framework" code, and no runtime scope resolution.
3.  **Structural Integrity**: The output structure matches the input structure (macro expansion). Components do not create runtime boundaries.
4.  **Deterministic Identity**: Interactive anchors and bindings resolve to stable, deterministic references at build time.
5.  **Simplicity**: Code exists only if proven necessary by an invariant. Deletion is preferred over abstraction.

## 2. Non-Goals (Explicitly Forbidden)

Zenith explicitly does **NOT** support or allow:

1.  **Runtime Ambiguity**: No behavior dependent on runtime introspection of types or structures.
2.  **Intent-Guessing**: The compiler does not infer intent. It enforces explicit instructions.
3.  **Future-Proofing**: No "helper" layers or abstractions added for hypothetical future use.
4.  **Runtime Scope Resolution**: No looking up identifiers at runtime. All bindings are resolved at compile time.
5.  **Complex Reactivity**: No fine-grained reactivity engine or dependency tracking unless fully resolved at compile time.
6.  **Heuristics**: No fuzzy matching or "best effort" recovery.

## 3. Compiler & Runtime Rules

### Compiler Phases
The compiler must operate in specific order:
1. **Parse**: Convert source to AST.
2. **Scope**: Identify all identifiers and their origins.
3. **Safety**: Enforce access rules (e.g. no access to undeclared vars).
4. **Renaming**: Stabilize identifiers.
5. **Lowering**: Transform to backend IR (Symbolic).
6. **Emit**: Generate final JS/HTML/CSS.

Reordering phases is forbidden.

### Runtime Constraints
The runtime is **permitted** to:
1.  **Bind Events**: Attach native listeners to compiled anchors.
2.  **Execute Instructions**: Run specific, compiler-approved function calls.
3.  **Schedule Effects**: Perform DOM updates strictly as directed by the compiled output.

The runtime is **forbidden** from:
1.  **Interpreting Syntax**: No processing of template strings or expressions.
2.  **Deriving State**: No state management logic beyond simple values.
3.  **Recovering Errors**: Runtime errors indicate compiler failure; the runtime must not attempt to recover.

## 4. Contribution Contract

1.  **Preserve Invariants**: All PRs must maintain or strengthen the invariants listed above.
2.  **Hard Build Failure**: Any violation of internal boundaries or safety gates must result in a compile-time error, never a runtime warning.
3.  **No Internal API Exposure**: Internal compiler/runtime APIs must not be reachable by end-user code.
4.  **Explicit Contract Proof**: New features must include positive and negative tests proving they do not violate the contract (e.g. "Should fail if X").

## 5. Versioning & Stability Policy

1.  **Major Versions (x.0.0)**: Reserved for changes that alter invariants or require manual migration of valid Zenith code.
2.  **Minor Versions (0.x.0)**: New features that strictly adhere to existing invariants.
3.  **Patch Versions (0.0.x)**: Docs, performance fixes, or dead code removal.

**Stability**: The "Public Specification" logic is versioned. Changes to `zenith-spec.md` usually trigger a major version discussion.
