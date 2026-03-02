# Component Stacking Fix - Design Document

## Overview

This document explains the root cause of the component stacking bug and the fix implemented to resolve it.

## Problem Statement

Multiple sibling components would not render simultaneously. When using:

```zen
<Header />
<Hero />
<Footer />
```

Only one component would render. Commenting out one component allowed another to appear.

## Root Cause Analysis

### The Bug: Self-Closing Tags in HTML5/parse5

The root cause was in how the template parser handled self-closing component tags like `<Header />`.

**HTML5 specification**: In HTML5, self-closing syntax (`/>`) is only valid for [void elements](https://html.spec.whatwg.org/#void-elements) like `<br />`, `<img />`, `<input />`. For any other element, `<Tag />` is parsed as `<Tag>` (opening tag only).

**parse5 behavior**: The parse5 HTML parser (used by Zenith) follows HTML5 rules. When it sees `<Header />`:
- It ignores the `/` 
- Treats it as `<Header>` (opening tag)
- Everything after becomes children of `<Header>` until a `</Header>` is found

**Result**: Sibling components became nested:

```
Before (what user wrote):
<Header />
<Hero />
<Footer />

After parsing (what the compiler saw):
<Header>
  <Hero>
    <Footer>
    </Footer>
  </Hero>
</Header>
```

This nesting meant only the outermost component was rendered correctly at the top level.

### Why This Wasn't Caught Earlier

1. The parsing produced valid AST nodes (just incorrectly nested)
2. Component resolution worked correctly on the nested structure
3. The HTML output looked correct at first glance
4. The issue manifested as a visual/rendering problem, not a compilation error

## The Fix

### Solution: Pre-process Self-Closing Component Tags

Added a pre-processing step in `parseTemplate.ts` that converts self-closing component tags to properly closed tags:

```typescript
/**
 * Convert self-closing component tags to properly closed tags
 * 
 * HTML5/parse5 treats `<ComponentName />` as an opening tag,
 * causing following siblings to be incorrectly nested as children.
 * 
 * This function converts `<ComponentName />` to `<ComponentName></ComponentName>`
 * for tags that start with uppercase (Zenith components).
 */
function convertSelfClosingComponents(html: string): string {
  // Match self-closing tags that start with uppercase (component tags)
  const selfClosingPattern = /<([A-Z][a-zA-Z0-9._-]*)([^>]*?)\/>/g
  
  return html.replace(selfClosingPattern, (match, tagName, attributes) => {
    return `<${tagName}${attributes}></${tagName}>`
  })
}
```

### Why This Fix Works

1. **Targets only components**: Only converts tags starting with uppercase (e.g., `<Header />`, not `<div />`)
2. **Preserves attributes**: Maintains all attributes on the tag
3. **Happens before parsing**: Runs before parse5 processes the HTML
4. **No runtime impact**: Fix is compile-time only

### After the Fix

```
Before (what user writes):
<Header />
<Hero />
<Footer />

After pre-processing:
<Header></Header>
<Hero></Hero>
<Footer></Footer>

After parsing (correctly as siblings):
├── <Header></Header>
├── <Hero></Hero>
└── <Footer></Footer>
```

## Additional Improvements

### Auto-Import System

Components are now auto-imported based on filename:

```
components/Header.zen → <Header />
components/sections/HeroSection.zen → <HeroSection />
components/ui/buttons/Primary.zen → <Primary />
```

**Rules:**
- Component name = filename (without .zen extension)
- Subdirectories are for organization only, not namespacing
- No explicit imports required in script tags

### Collision Detection

If two components have the same filename in different directories, the compiler now throws a clear error:

```
Component name collision detected!

Component name "Header" is used by multiple files:
  - Header.zen
  - sections/Header.zen

Each component must have a unique filename.
To fix: Rename one of the conflicting components.
```

## Alignment with Zenith Philosophy

This fix aligns with Zenith's core principles:

1. **Compile-time first, runtime last**: The fix happens entirely at compile time
2. **Compiler owns correctness**: Invalid component structure is caught during compilation
3. **Zero runtime abstractions**: No runtime component registration or resolution
4. **Familiar syntax**: Users can write `<Component />` naturally

## Testing

Tests added in `compiler/test/component-stacking-test.ts`:

1. **Multiple Sibling Components**: `<Header /> <Hero /> <Footer />`
2. **Multiple Instances of Same Component**: `<Card /> <Card /> <Card />`
3. **Nested Components**: `<Outer><Inner /></Outer>`
4. **Auto-Import Naming**: Verifies filename-based component naming

All tests pass.

## Migration Guide

**For existing projects:**

1. Self-closing component syntax (`<Component />`) now works correctly
2. Script-tag imports for components are optional (can be removed)
3. If you have component name collisions (same filename in different directories), rename one

**Before:**
```zen
<script setup="ts">
  import Header from '../components/Header.zen';
  import Hero from '../components/sections/Hero.zen';
</script>

<Header />
<Hero />
```

**After:**
```zen
<script setup="ts">
// Components are auto-imported - no imports needed!
</script>

<Header />
<Hero />
```

## Files Changed

- `zenith-core/compiler/parse/parseTemplate.ts` - Added `convertSelfClosingComponents()`
- `zenith-core/compiler/discovery/componentDiscovery.ts` - Updated auto-import naming and collision detection
- `zenith-core/compiler/test/component-stacking-test.ts` - New test file
