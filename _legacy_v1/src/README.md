# Zenith Compiler - Phase 1: Parse & Extract

## Overview

This is Phase 1 of the Zenith compiler implementation. This phase focuses on **parsing and extracting** structure from `.zen` files without any runtime execution or transformation.

## Directory Structure

```
/compiler
  /parse
    parseZenFile.ts    # Main file parser
    parseTemplate.ts   # Template/HTML parser
    parseScript.ts     # Script block extractor
  /ir
    types.ts           # Intermediate Representation types
  /errors
    compilerError.ts   # Compiler error handling
  index.ts             # Public API entry point
```

## Usage

```typescript
import { compileZen } from './compiler/index'

const ir = compileZen('app/pages/example.zen')
// Returns ZenIR structure with parsed template, script, styles, and extracted expressions
```

## What This Phase Does

✅ Parses `.zen` files into structured IR
✅ Extracts `<script>` and `<style>` blocks
✅ Parses HTML template structure
✅ Extracts `{expression}` patterns from text and attributes
✅ Records source locations for all nodes and expressions
✅ Throws compiler errors with location information

## What This Phase Does NOT Do

❌ Execute expressions
❌ Transform code
❌ Generate runtime code
❌ Handle reactivity
❌ Render to DOM
❌ Perform any runtime operations

## IR Structure

The compiler produces a `ZenIR` object containing:

- `filePath`: Path to the source file
- `template`: TemplateIR with nodes and extracted expressions
- `script`: ScriptIR with raw script content (or null)
- `styles`: Array of StyleIR with raw style content

## Expression Extraction

Expressions are extracted from:
- Text content: `Hello {name}!`
- Attribute values: `class={isActive ? "on" : "off"}`

Each expression gets:
- Unique ID (e.g., `expr_0`, `expr_1`)
- Source code (the expression content)
- Source location (line + column)

## Phase 2: Transform IR → Static HTML + Runtime Bindings

Phase 2 transforms the IR into static HTML with explicit bindings:

- ✅ All `{}` expressions removed from HTML
- ✅ Expressions replaced with data attributes (`data-zen-text`, `data-zen-attr-*`)
- ✅ Bindings array generated with expression source code
- ✅ Scripts and styles pass through unchanged
- ✅ No runtime execution - pure transformation

### Output Structure

```typescript
{
  html: string,        // Static HTML with no {}
  bindings: Binding[], // Array of expression bindings
  scripts: string,     // Raw script content
  styles: string[]     // Raw style content
}
```

### Binding Format

```typescript
{
  id: "exp_1",
  type: "text" | "attribute",
  target: "data-zen-text" | "class" | "style" | etc,
  expression: "user.name" // Original expression code
}
```

## Phase 4: Runtime DOM & Reactivity

Phase 4 transforms the IR into fully functional runtime JavaScript code:

- ✅ Expression wrapping with state access
- ✅ DOM creation code generation
- ✅ Event handler binding
- ✅ State initialization
- ✅ Hydrate function for SPA hydration
- ✅ Style injection

### Runtime Code Structure

```typescript
{
  expressions: string,  // Wrapped expression functions
  render: string,       // renderDynamicPage(state) function
  hydrate: string,      // hydrate(root, state) function
  styles: string,       // Style injection code
  script: string,       // Transformed script code
  stateInit: string     // State initialization code
}
```

### Usage

```typescript
import { compileZen } from './compiler/index'
import { transformIR } from './compiler/runtime/transformIR'

const { ir } = compileZen('app/pages/example.zen')
const runtime = transformIR(ir)

// Runtime code is now ready to execute
// - runtime.expressions: Expression wrapper functions
// - runtime.render: DOM creation function
// - runtime.hydrate: Hydration function
```

## Phase 5: Runtime Hydration

Phase 5 provides the browser-side runtime that hydrates static HTML with dynamic expressions:

- ✅ Expression evaluation via registry (`window.__ZENITH_EXPRESSIONS__`)
- ✅ Text binding updates (`data-zen-text` attributes)
- ✅ Attribute binding updates (`data-zen-attr-*` attributes)
- ✅ Event handler binding (`data-zen-{eventType}` attributes)
- ✅ Reactive state updates (`update(state)` function)
- ✅ Cleanup and memory management
- ✅ Error handling with expression IDs

### Runtime Functions

```typescript
// Hydrate static HTML with dynamic expressions
window.zenithHydrate(state, container?)

// Update all bindings when state changes
window.zenithUpdate(state)

// Bind event handlers
window.zenithBindEvents(container?)

// Cleanup bindings and event listeners
window.zenithCleanup(container?)
```

### Runtime Bundle

The `transformIR` function now generates a complete runtime bundle:

```typescript
const runtime = transformIR(ir)
// runtime.bundle contains the complete JavaScript code ready for browser execution
```

The bundle includes:
- Expression wrapper functions
- Expression registry initialization
- Hydration runtime code
- State initialization
- Style injection
- User script code

### Usage Example

```typescript
// In browser
const state = { user: { name: 'Alice' }, count: 5 }
window.zenithHydrate(state, document.body)

// On state change
state.count = 10
window.zenithUpdate(state)
```

## Phase 6: Explicit Data Exposure

Phase 6 ensures all data references are explicit rather than relying on implicit globals:

- ✅ Expression dependency analysis (loaderData, props, stores, state)
- ✅ Explicit function signatures with data arguments
- ✅ Updated hydration runtime to pass explicit data
- ✅ Compile-time validation of data references
- ✅ Backwards compatibility with legacy state-only expressions

### Data Sources

Expressions can reference data from:
1. **Loader Data** - Route-level `loader()` function data (`loaderData.user.name`)
2. **Props** - Component/page props (`props.title`)
3. **Stores** - Global stores (`stores.cart.items`)
4. **State** - Reactive state (`state.count`)

### Expression Wrapper Signatures

Phase 6 expressions now accept explicit arguments:

```typescript
// Before (Phase 5)
const expr_0 = (state) => { with (state) { return user.name } }

// After (Phase 6)
const expr_0 = (state, loaderData, props, stores) => {
  const __ctx = Object.assign({}, loaderData, props, stores, state);
  with (__ctx) { return user.name }
}
```

### Runtime Hydration

```typescript
// Phase 6 signature
window.zenithHydrate(state, loaderData, props, stores, container?)
window.zenithUpdate(state, loaderData, props, stores)
```

The runtime maintains backwards compatibility - if called with only `state`, it uses legacy behavior.

### Data Dependency Analysis

The compiler analyzes each expression to detect:
- `loaderData.property` → loader data dependency
- `props.name` → props dependency
- `stores.name` → stores dependency
- Simple identifiers → state dependency

All dependencies are validated at compile time with clear error messages.

## Phase 7: Navigation, Prefetch & Bun Accelerator

Phase 7 implements safe SPA navigation with prefetching and explicit data exposure:

- ✅ Prefetch compiled output (HTML + JS) for routes
- ✅ Route caching system
- ✅ Safe SPA navigation with explicit data (loaderData, props, stores)
- ✅ Browser history handling (back/forward)
- ✅ ZenLink component with prefetch support
- ✅ Navigation runtime integration
- ✅ No raw .zen files in browser

### Navigation API

```typescript
// Prefetch a route
window.__zenith_prefetch('/dashboard')

// Navigate with explicit data
window.navigate('/dashboard', {
  loaderData: { user: { name: 'Alice' } },
  props: { title: 'Dashboard' },
  stores: { cart: { items: 3 } },
  replace: false  // Use pushState instead of replaceState
})
```

### ZenLink Component

```html
<!-- With prefetch (on hover) -->
<ZenLink href="/about" prefetch={true}>About</ZenLink>

<!-- Without prefetch -->
<ZenLink href="/blog">Blog</ZenLink>
```

### Key Principles

1. **Compiler owns all expressions** - Runtime never parses .zen files
2. **Prefetch compiled output** - HTML + JS bundles, not source
3. **Explicit data exposure** - All data passed explicitly (no implicit globals)
4. **Bun as accelerator** - Used for bundling/transpilation, not template parsing
5. **Safe navigation** - No stacked mutations, proper cleanup, history handling

### Route Cache

Prefetched routes are cached with:
- Compiled HTML
- Compiled JS runtime
- Styles
- Route metadata

### Browser History

The navigation system:
- Handles `popstate` events for back/forward
- Updates DOM safely without re-parsing
- Maintains route state correctly
- Avoids stacked history mutations

## Phase 8/9/10: Finalization & Build Guarantees

Phase 8/9/10 ensures deterministic compilation and compile-time validation:

- ✅ Compile-time expression validation
- ✅ Build fails on invalid expressions with line/column info
- ✅ No raw `{expression}` in HTML output
- ✅ Thin declarative runtime (no eval, no template parsing)
- ✅ Bun integration for bundling/transpilation (not template parsing)
- ✅ Final HTML + JS output ready for browser

### Validation

All expressions are validated at compile time:
- Syntax validation
- Brace/parentheses/bracket matching
- Unsafe code detection (eval, Function, with)
- Build fails immediately on errors

### Output Guarantees

- **HTML**: Contains only hydration markers (`data-zen-text`, `data-zen-attr-*`)
- **JS**: Pre-compiled expression functions, no template parsing
- **Runtime**: Thin, declarative - only DOM updates and event binding
- **No eval**: Runtime never uses `eval`, `new Function`, or `with(window)`

### Bun Integration

Bun is used as an accelerator for:
- ✅ JS/TS transpilation
- ✅ Asset bundling
- ✅ SSR runtime support

Bun is **NOT** used for:
- ❌ Template parsing
- ❌ Expression analysis
- ❌ AST transformations

### Build Guarantees

- Build success = UI guaranteed to work
- All failures are compile-time (never runtime)
- Error messages include file, line, column
- Invalid expressions fail the build immediately

## Next Phases

Future enhancements:
- Enhanced conditional/ternary handling in IR
- Map iteration support in IR
- Advanced reactivity with dependency tracking
- SSR/SSG/ISR output generation
- Type checking for loader/props/stores data
- Route cache generation in build system

## Testing

The compiler can be tested by importing and calling `compileZen()`:

```typescript
import { compileZen } from './compiler/index'

try {
  const ir = compileZen('app/pages/example.zen')
  console.log(JSON.stringify(ir, null, 2))
} catch (error) {
  console.error('Compiler error:', error)
}
```

