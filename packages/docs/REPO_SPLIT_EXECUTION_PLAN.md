# Zenith Repo Split Execution Plan

**Status:** Blocked (see Prerequisites)  
**Target:** Q1 2026  
**Owner:** Zenith Core Team

---

## Prerequisites (Must Complete First)

### ❌ P1: Fix Runtime Loop Structural Violation

**Current State:**
```typescript
// client-runtime.ts:683
node.innerHTML = '';  // VIOLATES philosophy
```

**Required Action:**
Implement keyed hydration that reuses DOM nodes instead of clearing/re-rendering.

**Acceptance Criteria:**
- [ ] Loop updates do not call `innerHTML = ''`
- [ ] Existing DOM nodes are reused when items match
- [ ] Only truly new items trigger `cloneNode()`
- [ ] Unit test: Update list without DOM recreation

### ❌ P2: Define CompilerOutput Interface

**Required Action:**
Create formal TypeScript interface as specified in RFC-001.

**Acceptance Criteria:**
- [ ] `CompilerOutput` interface defined in `compiler-types`
- [ ] All compiler functions return this interface
- [ ] Runtime only consumes this interface

### ❌ P3: Add Missing Invariant Enforcement

**Required Action:**
Implement INV-EXPR-REG-001, INV-RUNTIME-STRUCT-001.

**Acceptance Criteria:**
- [ ] Compile fails if binding references unregistered expression
- [ ] Test coverage for all invariants

### ❌ P4: Verify zenith-site with New .map() Lowering

**Required Action:**
Build and run zenith-site, verify PhilosophySection renders correctly.

**Acceptance Criteria:**
- [ ] `bun run dev` in zenith-site succeeds
- [ ] Philosophy cards render with icons, titles, descriptions
- [ ] No console errors
- [ ] Works with JS disabled (SSR)

---

## Execution Phases

### Phase 1: Type Extraction

**Duration:** 1 week  
**Risk:** Low

#### Step 1.1: Create @zenithbuild/compiler-types

```bash
mkdir zenith-compiler-types
cd zenith-compiler-types
bun init
```

**Package Structure:**
```
zenith-compiler-types/
├── src/
│   ├── ir/
│   │   ├── index.ts
│   │   ├── template.ts
│   │   ├── script.ts
│   │   └── expression.ts
│   ├── output/
│   │   ├── index.ts
│   │   ├── compiled.ts
│   │   └── binding.ts
│   ├── invariants/
│   │   ├── index.ts
│   │   ├── codes.ts
│   │   └── error.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

**package.json:**
```json
{
  "name": "@zenithbuild/compiler-types",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./ir": "./dist/ir/index.js",
    "./output": "./dist/output/index.js",
    "./invariants": "./dist/invariants/index.js"
  }
}
```

#### Step 1.2: Move Types from zenith-core

**Files to Move:**
- `compiler/ir/types.ts` → `compiler-types/src/ir/`
- `compiler/output/types.ts` → `compiler-types/src/output/`
- `compiler/validate/invariants.ts` (types only) → `compiler-types/src/invariants/`
- `compiler/errors/compilerError.ts` → `compiler-types/src/invariants/`

#### Step 1.3: Update zenith-core Imports

Replace local type imports with:
```typescript
import type { ZenIR, TemplateNode } from '@zenithbuild/compiler-types/ir';
import type { CompilerOutput, Binding } from '@zenithbuild/compiler-types/output';
import { INVARIANT, InvariantError } from '@zenithbuild/compiler-types/invariants';
```

#### Step 1.4: Verify

```bash
cd zenith-core
bun test
bun run build
```

---

### Phase 2: Compiler Extraction

**Duration:** 2 weeks  
**Risk:** Medium

#### Step 2.1: Create @zenithbuild/compiler

```bash
mkdir zenith-compiler
cd zenith-compiler
bun init
```

**Package Structure:**
```
zenith-compiler/
├── src/
│   ├── parse/
│   │   ├── parseTemplate.ts
│   │   ├── parseScript.ts
│   │   ├── parseImports.ts
│   │   ├── detectMapExpressions.ts
│   │   ├── trackLoopContext.ts
│   │   └── scriptAnalysis.ts
│   ├── transform/
│   │   ├── fragmentLowering.ts
│   │   ├── classifyExpression.ts
│   │   ├── componentResolver.ts
│   │   ├── transformTemplate.ts
│   │   ├── transformNode.ts
│   │   └── ...
│   ├── validate/
│   │   ├── invariants.ts (implementation)
│   │   └── validateExpressions.ts
│   ├── finalize/
│   │   ├── finalizeOutput.ts
│   │   └── generateFinalBundle.ts
│   ├── runtime/  # Code generation for runtime, NOT runtime itself
│   │   ├── transformIR.ts
│   │   ├── wrapExpression.ts
│   │   ├── generateHydrationBundle.ts
│   │   └── ...
│   ├── discovery/
│   │   ├── componentDiscovery.ts
│   │   └── layouts.ts
│   ├── api/
│   │   ├── compile.ts      # Public API
│   │   ├── parse.ts        # Public API
│   │   └── transform.ts    # Public API
│   └── index.ts            # Public exports only
├── package.json
└── tsconfig.json
```

**Public API (src/index.ts):**
```typescript
// Public compilation functions
export { compileZen, compileZenSource } from './api/compile';
export { parseZen } from './api/parse';
export { transformIR } from './api/transform';
export { validateIR } from './validate/invariants';

// Re-export types from compiler-types
export type {
    ZenIR,
    TemplateIR,
    TemplateNode,
    CompilerOutput,
    CompileOptions,
} from '@zenithbuild/compiler-types';

// Export error classes
export { CompilerError, InvariantError } from '@zenithbuild/compiler-types/invariants';
```

#### Step 2.2: Implement Public API Wrappers

**src/api/compile.ts:**
```typescript
import type { CompilerOutput, CompileOptions } from '@zenithbuild/compiler-types';
import { readFileSync } from 'fs';
import { parseTemplate } from '../parse/parseTemplate';
import { parseScript } from '../parse/parseScript';
import { transformTemplate } from '../transform/transformTemplate';
import { finalizeOutputOrThrow } from '../finalize/finalizeOutput';
import { validateInvariants } from '../validate/invariants';

export async function compileZen(
    filePath: string,
    options?: CompileOptions
): Promise<CompilerOutput> {
    const source = readFileSync(filePath, 'utf-8');
    return compileZenSource(source, filePath, options);
}

export async function compileZenSource(
    source: string,
    filePath: string,
    options?: CompileOptions
): Promise<CompilerOutput> {
    // ... existing implementation ...
    
    // Convert internal result to public CompilerOutput
    return {
        html: finalized.html,
        js: finalized.js,
        styles: finalized.styles,
        bindings: compiled.bindings,
        expressions: ir.template.expressions,
        errors: [],
        success: true
    };
}
```

#### Step 2.3: Update zenith-core to Use @zenithbuild/compiler

**zenith-core/compiler/index.ts:**
```typescript
// Re-export from @zenithbuild/compiler
export {
    compileZen,
    compileZenSource,
    parseZen,
    transformIR,
    validateIR
} from '@zenithbuild/compiler';
```

#### Step 2.4: Update CLI Commands

**zenith-core/cli/commands/build.ts:**
```typescript
import { compileZen } from '@zenithbuild/compiler';
// ... use public API only
```

#### Step 2.5: Verify

```bash
# Test compiler in isolation
cd zenith-compiler
bun test

# Test integration
cd zenith-core
bun test

# Test CLI
cd zenith-core
bun run build:cli
./dist/zenith.js build --help
```

---

### Phase 3: Runtime Separation

**Duration:** 2 weeks  
**Risk:** High

#### Step 3.1: Create @zenithbuild/runtime

```bash
mkdir zenith-runtime
cd zenith-runtime
bun init
```

**Package Structure:**
```
zenith-runtime/
├── src/
│   ├── reactivity/
│   │   ├── signal.ts
│   │   ├── state.ts
│   │   ├── effect.ts
│   │   ├── memo.ts
│   │   └── batch.ts
│   ├── hydration/
│   │   ├── hydrate.ts
│   │   ├── bindings.ts
│   │   ├── loops.ts
│   │   └── events.ts
│   ├── lifecycle/
│   │   ├── mount.ts
│   │   └── unmount.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

**Dependencies:**
```json
{
  "dependencies": {
    "@zenithbuild/compiler-types": "^1.0.0"
  }
}
```

#### Step 3.2: Move Runtime Code

**Files to Move:**
- `zenith-core/runtime/client-runtime.ts` → Split into modules
- `zenith-core/core/reactivity/` → `zenith-runtime/src/reactivity/`

#### Step 3.3: Implement Keyed Loop Hydration

**zenith-runtime/src/hydration/loops.ts:**
```typescript
import type { LoopBinding } from '@zenithbuild/compiler-types/output';

export function hydrateLoop(
    binding: LoopBinding,
    state: any,
    expressionRegistry: Map<string, Function>
): void {
    const { node, sourceExpr, itemVar, indexVar, template } = binding;
    
    // Get current list
    const expr = expressionRegistry.get(sourceExpr);
    if (!expr) return;
    
    const list = expr(state) || [];
    
    // KEYED RECONCILIATION (not clear + re-render)
    reconcileChildren(node, list, template, itemVar, indexVar, state, expressionRegistry);
}

function reconcileChildren(
    container: Element,
    list: any[],
    template: Node[],
    itemVar: string,
    indexVar: string | null,
    state: any,
    expressionRegistry: Map<string, Function>
): void {
    const existingChildren = Array.from(container.children);
    const existingByKey = new Map<string, Element>();
    
    // Index existing children by key
    existingChildren.forEach((child, i) => {
        const key = (child as any)._zen_key || `index_${i}`;
        existingByKey.set(key, child);
    });
    
    // Reconcile
    list.forEach((item, index) => {
        const key = item.id ?? item.key ?? `index_${index}`;
        let child = existingByKey.get(key);
        
        if (child) {
            // REUSE existing node
            existingByKey.delete(key);
            updateChildBindings(child, { ...state, [itemVar]: item, ...(indexVar ? { [indexVar]: index } : {}) });
        } else {
            // CREATE new node (only when truly new)
            child = createFromTemplate(template, item, index, itemVar, indexVar);
            container.appendChild(child);
        }
    });
    
    // REMOVE orphaned nodes
    existingByKey.forEach((orphan) => {
        orphan.remove();
    });
}
```

#### Step 3.4: Update zenith-core to Use @zenithbuild/runtime

**zenith-core/runtime/index.ts:**
```typescript
// Re-export from @zenithbuild/runtime
export * from '@zenithbuild/runtime';
```

#### Step 3.5: Verify

```bash
# Test runtime in isolation
cd zenith-runtime
bun test

# Test integration
cd zenith-core
bun test

# End-to-end test with zenith-site
cd zenith-site
bun run dev
```

---

### Phase 4: Core Simplification

**Duration:** 1 week  
**Risk:** Low

#### Step 4.1: Update @zenithbuild/core

**zenith-core/index.ts:**
```typescript
// Meta-package: Re-export from child packages

// Compiler
export {
    compileZen,
    compileZenSource,
    parseZen,
    transformIR,
    validateIR
} from '@zenithbuild/compiler';

// Runtime
export {
    zenSignal,
    zenState,
    zenEffect,
    zenMemo,
    zenRef,
    zenBatch,
    zenUntrack,
    zenOnMount,
    zenOnUnmount,
    hydrate,
    update,
    cleanup
} from '@zenithbuild/runtime';

// Types
export type {
    ZenIR,
    TemplateIR,
    CompilerOutput,
    CompileOptions
} from '@zenithbuild/compiler-types';
```

**zenith-core/package.json:**
```json
{
  "name": "@zenithbuild/core",
  "version": "2.0.0",
  "dependencies": {
    "@zenithbuild/compiler": "^1.0.0",
    "@zenithbuild/compiler-types": "^1.0.0",
    "@zenithbuild/runtime": "^1.0.0"
  }
}
```

#### Step 4.2: Update All Consumers

- zenith-site
- zenith-plugins
- create-zenith
- zenith-language-server

#### Step 4.3: Final Verification

```bash
# Full test suite
bun test --all

# Build all packages
bun run build:all

# Verify zenith-site
cd zenith-site
bun run build
bun run preview
```

---

## Rollback Plan

If issues are discovered post-extraction:

1. **Immediate:** Revert to monorepo by restoring `@zenithbuild/core` as single package
2. **Version Lock:** Pin all consumers to last working version
3. **Post-Mortem:** Document failure mode, update plan

---

## Success Criteria

- [ ] All tests pass in isolated packages
- [ ] zenith-site builds and runs correctly
- [ ] No philosophy violations in final architecture
- [ ] Clear package boundaries enforced by TypeScript
- [ ] Documentation updated for new structure

---

## Timeline

| Week | Milestone |
|------|-----------|
| W1 | Prerequisites P1-P4 complete |
| W2 | Phase 1: Type Extraction complete |
| W3-W4 | Phase 2: Compiler Extraction complete |
| W5-W6 | Phase 3: Runtime Separation complete |
| W7 | Phase 4: Core Simplification complete |
| W8 | Testing, documentation, release |

**Target Release:** v2.0.0

---

## Appendix: File Movement Checklist

### To @zenithbuild/compiler-types

- [ ] `compiler/ir/types.ts`
- [ ] `compiler/output/types.ts`
- [ ] `compiler/errors/compilerError.ts`
- [ ] Invariant type definitions from `compiler/validate/invariants.ts`

### To @zenithbuild/compiler

- [ ] `compiler/parse/*`
- [ ] `compiler/transform/*`
- [ ] `compiler/validate/*`
- [ ] `compiler/finalize/*`
- [ ] `compiler/runtime/*` (code generators, NOT runtime)
- [ ] `compiler/discovery/*`
- [ ] `compiler/css/*`

### To @zenithbuild/runtime

- [ ] `runtime/client-runtime.ts` (split into modules)
- [ ] `core/reactivity/*`
- [ ] `core/lifecycle/*`

### Stays in @zenithbuild/core

- [ ] `cli/*`
- [ ] `bin/*`
- [ ] `router/*`
- [ ] Re-export index files
