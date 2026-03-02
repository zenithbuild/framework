# Zenith Framework — Systems Verification Report

**Date:** January 17, 2026  
**Version:** 1.2.2 (zenith-core)  
**Auditor:** Opus (Compiler Systems Auditor)

---

## Executive Summary

| Subsystem | Status | Notes |
|-----------|--------|-------|
| **Compiler** | ✅ Verified | Pipeline coherent, expression registration working |
| **Runtime** | ⚠️ Risk | Structural interpretation in loops violates philosophy |
| **CLI** | ✅ Verified | Clean separation, no compiler internals leaked |
| **UI (zenith-site)** | ⚠️ Risk | Untested with new .map() lowering |

**Go / No-Go Decision:** 🔴 **No-Go for Extraction**

The compiler is architecturally sound but has critical runtime coupling that must be resolved before extraction.

---

## A. System Health Report

### 1. Compiler — ✅ Verified

**Pipeline Trace: Source → AST → Lowering → IR → HTML → Runtime**

```
.zen file
    ↓ parseTemplate()
    ↓ normalizeAllExpressions() — replaces {} with __ZEN_EXPR_N placeholders
    ↓ parse5 fragment parsing
    ↓ parseNode() — builds ElementNode/ComponentNode/ExpressionNode
    ↓ extractExpressionsFromText() — registers ExpressionIR with unique ID
    ↓ lowerFragments() — transforms .map()/ternary/&& to LoopFragmentNode etc.
    ↓ validateInvariants()
    ↓ transformTemplate() — generates HTML + Binding[]
    ↓ transformNode() — emits data-zen-* markers with expression IDs
    ↓ finalizeOutput() — validates no raw expressions, generates JS bundle
    ↓ generateExpressionWrappers() + generateExpressionRegistry()
    ↓
HTML (static) + JS (expression evaluators + hydration)
```

**Verified Behaviors:**
- ✅ All expressions registered as ExpressionIR before IR phase
- ✅ HTML contains only expression IDs, never raw code
- ✅ Loop sources registered via `registerExpression()` (line 260)
- ✅ Conditional/optional expressions also properly registered
- ✅ `verifyNoRawExpressions()` catches uncompiled expressions at finalize
- ✅ Components resolved at compile time (INV003 enforced)
- ✅ `<template>` and `slot=""` forbidden (INV005/INV006 enforced)

### 2. Runtime — ⚠️ Risk

**Verified Passive Behaviors:**
- ✅ Binds expressions by ID via `expressionRegistry.get()`
- ✅ Attaches event listeners via `data-zen-{event}` markers
- ✅ Applies updates via `updateBindings()`

**Philosophy Violations Found:**

#### ❌ VIOLATION: Loop Structural Interpretation at Runtime

```typescript
// client-runtime.ts:683-708
node.innerHTML = '';  // CLEARS compiler-generated structure
binding.itemBindings = [];

list.forEach((item, index) => {
    // Clone Template — RUNTIME creates DOM structure
    const fragment = document.createDocumentFragment();
    template.forEach(n => fragment.appendChild(n.cloneNode(true)));
    // ...
    node.appendChild(fragment);
});
```

**This violates:**
- "Compiler-Owned Structure" — runtime is creating DOM
- "Zero Runtime Abstractions" — runtime interprets loop semantics
- "Compile-Time First" — structure decisions made at runtime

**Root Cause:** The compiler emits ONE template instance for SSR, but runtime must clone/multiply for each array item. This is inherent to dynamic lists but the implementation is too aggressive.

#### ⚠️ RISK: Expression Evaluation via `new Function()`

```typescript
// wrapExpression.ts:61-62
var evalFn = new Function('__ctx',
  'with (__ctx) { return (' + '${escapedTransformedCode}' + '); }'
);
```

While this is compile-time code generation (acceptable), the `with` statement dependency creates:
- CSP policy concerns in production
- Potential scope leakage

### 3. CLI — ✅ Verified

- Clean command structure in `cli/commands/`
- No direct compiler internal dependencies
- Uses public `compileZen()` / `compileZenSource()` APIs
- Version management independent

### 4. UI (zenith-site) — ⚠️ Risk

The `PhilosophySection.zen` now uses JSX `.map()` syntax:

```html
{philosophyItems.map(item => (
    <div>
        <html-content content="item.icon" />
        <h3>{item.title}</h3>
        <p>{item.description}</p>
    </div>
))}
```

**Untested:** This component has not been verified to render correctly after the regression fix. The `html-content` directive with `content="item.icon"` (string attribute, not JSX expression) should work but needs runtime verification.

---

## B. Invariant Status Table

| Invariant | Code | Status | Location | Severity |
|-----------|------|--------|----------|----------|
| Loop Context Preserved | INV001 | ✅ Enforced | `invariants.ts:187-214` | High |
| Attribute Forwarding | INV002 | ⚠️ Missing | Not implemented | Medium |
| Unresolved Components | INV003 | ✅ Enforced | `invariants.ts:76-102` | Critical |
| Reactive Boundary | INV004 | ⚠️ Missing | Not implemented | High |
| No Template Tags | INV005 | ✅ Enforced | `parseTemplate.ts:387-396` | Medium |
| No Slot Attributes | INV006 | ✅ Enforced | `parseTemplate.ts:410-418` | Medium |
| Orphan Compound | INV007 | ✅ Enforced | `invariants.ts:256-271` | Medium |
| Non-Enumerable JSX | INV008 | ✅ Enforced | `fragmentLowering.ts:124-132` | Critical |

### Missing Invariants (Must Add)

| Proposed Invariant | Description | Severity |
|-------------------|-------------|----------|
| **INV-EXPR-REG-001** | No raw expressions survive parsing | Critical |
| **INV-RUNTIME-STRUCT-001** | Runtime must not create DOM structure | Critical |
| **INV-SCOPE-ISOLATION-001** | Reactivity never crosses component boundaries | High |
| **INV-COMPILE-DETERMINISM-001** | Same input = same output | Medium |

---

## C. Go / No-Go Decision

### 🔴 NO-GO for Compiler Extraction

**Blocking Issues:**

1. **Runtime Structural Ownership (Critical)**
   - Loop hydration creates DOM at runtime
   - Violates "Compiler-Owned Structure" principle
   - Cannot extract compiler while runtime has structural authority

2. **Missing INV-RUNTIME-STRUCT-001 Enforcement**
   - No compile-time check prevents runtime structural operations
   - Philosophy violation not detectable until runtime

3. **Expression Wrapper Coupling**
   - `wrapExpression.ts` generates code that depends on runtime globals
   - `window.__zenith`, `window.__ZENITH_EXPRESSIONS__` are implicit contracts
   - No formal interface between compiler output and runtime input

### Conditions for Go:

1. Define formal `CompilerOutput` interface consumed by runtime
2. Implement keyed/reconciled loop hydration that doesn't clear DOM
3. Add INV-RUNTIME-STRUCT-001 as compile-time structural assertion
4. Document runtime contract as part of compiler public API

---

## D. Actionable Recommendations

### 1. Fix Runtime Loop Hydration (Critical)

**Current:** Runtime clears and re-renders entire loop on every update.

**Required:** Keyed hydration that reuses existing DOM nodes.

```typescript
// CURRENT (violates philosophy)
node.innerHTML = '';
list.forEach((item, index) => { ... clone template ... });

// REQUIRED (philosophy-aligned)
// Compiler emits N instances at SSR time (or placeholder markers)
// Runtime only binds/updates, never creates
reconcileLoopItems(node, list, template, (item, existingNode) => {
    updateBindings(existingNode.bindings, { ...state, item });
});
```

### 2. Formalize Compiler Output Contract

Create explicit interface:

```typescript
// compiler/output/contract.ts
export interface ZenithCompilerOutput {
    html: string;
    expressions: Map<string, ExpressionDefinition>;
    bindings: BindingDefinition[];
    styles: string[];
}

export interface ExpressionDefinition {
    id: string;
    evaluator: string; // JS code string
    dependencies: string[];
}

export interface BindingDefinition {
    id: string;
    type: 'text' | 'attribute' | 'loop' | 'conditional' | 'optional';
    target: string;
    expressionId: string;
}
```

### 3. Add Missing Invariant Enforcement

```typescript
// validate/invariants.ts

export function validateRuntimeContractCompliance(output: CompilerOutput): void {
    // INV-EXPR-REG-001: All bindings reference registered expressions
    for (const binding of output.bindings) {
        if (!output.expressions.has(binding.expressionId)) {
            throw new InvariantError(
                'INV-EXPR-REG-001',
                `Binding ${binding.id} references unregistered expression ${binding.expressionId}`,
                // ...
            );
        }
    }
}
```

### 4. Do NOT Implement

- ❌ Runtime component instantiation
- ❌ Virtual DOM / diffing
- ❌ Runtime slot resolution
- ❌ Dynamic component loading
- ❌ Any form of reconciliation that interprets structure

---

## Appendix: Repo Split Execution Plan (Draft)

**Blocked until above issues resolved.**

### Phase 1: Stabilization (Current)
- [ ] Fix loop hydration to be non-structural
- [ ] Define CompilerOutput contract
- [ ] Add missing invariants
- [ ] 100% test coverage on expression registration

### Phase 2: Interface Extraction
- [ ] Extract `@zenithbuild/compiler-types` with IR and output types
- [ ] Extract `@zenithbuild/compiler` with core compilation
- [ ] Runtime depends only on `@zenithbuild/compiler-types`

### Phase 3: Verification
- [ ] Runtime passes with compiler output mocks
- [ ] Compiler passes with runtime contract tests
- [ ] End-to-end verification with zenith-site

### Proposed Package Structure

```
@zenithbuild/compiler-types    # IR, Output types, Invariant definitions
@zenithbuild/compiler          # Core compilation (parse, transform, finalize)
@zenithbuild/runtime           # Hydration, binding, reactivity
@zenithbuild/cli               # Commands, orchestration
@zenithbuild/core              # Meta-package, re-exports
```

---

## Conclusion

Zenith's compiler architecture is philosophically sound and well-implemented. The expression registration system correctly enforces INV-EXPR-REG-001. However, the runtime's loop handling violates the "Compiler-Owned Structure" principle by creating DOM at runtime.

**The compiler cannot be extracted until the runtime's structural authority is eliminated.**

This is not a bug — it's an architectural tension between:
1. Dynamic list rendering (inherently requires runtime DOM creation)
2. "Zero Runtime Abstractions" principle

The resolution requires either:
- **Option A:** Accept that loops are a special case where runtime creates DOM (document the exception)
- **Option B:** Pre-render maximum expected items at compile time with visibility toggling (pure but limiting)
- **Option C:** Hybrid: Compiler emits keyed placeholders, runtime only reorders/shows/hides (recommended)

Recommend **Option C** as it preserves philosophy while enabling practical list rendering.

---

*Report generated by Opus — Compiler Systems Auditor*
*Zenith Framework v1.2.2*
