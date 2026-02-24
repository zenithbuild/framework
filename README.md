# Zenith Bundler

> **⚠️ Internal API:** This package is an internal implementation detail of the Zenith framework. It is not intended for public use and its API may break without warning. Please use `@zenithbuild/core` instead.


Zero-Cost Abstraction Bundler for the Zenith Framework.

## Overview

The Zenith Bundler provides capability-based runtime chunking, CSS pruning, and deferred hydration for optimal production builds. Instead of shipping a monolithic runtime, it selectively includes only the capabilities used by each page.

## Architecture

```
Compiler (ZenIR) → Manifest → Bundler → Optimized Output
```

### Runtime Slices

| Slice | Size | When Included |
|-------|------|---------------|
| **Core** | ~2KB | Always required |
| **Reactivity** | ~8KB | If `{value}` expressions or state used |
| **Hydration** | ~5KB | If page is interactive |

## Installation

```bash
# Rust crate
cargo add zenith-bundler

# TypeScript package
bun add @zenithbuild/bundler
```

## Usage

### Rust

```rust
use zenith_bundler::{bundle, analyze_manifest, ZenManifest};

let manifest = ZenManifest::new("src/pages/index.zen".to_string());
let analysis = analyze_manifest(&manifest);

println!("Required slices: {:?}", analysis.required_slices);
println!("Is static: {}", analysis.is_static);
```

### TypeScript

```typescript
import { bundle, generateRuntime } from '@zenithbuild/bundler'

// Full production bundle
const result = bundle(manifest, { 
  minifyJs: true,
  minifyCss: true,
  basePath: '/assets/'
})

// Dev server (HMR)
const { code, slices } = generateRuntime(manifest, true)
```

## API

### `bundle(manifest, options?)`

Generates complete HTML/JS/CSS output.

**Options:**
- `minifyJs` - Minify JavaScript (default: true)
- `minifyCss` - Minify CSS (default: true)
- `inlineCriticalCss` - Inline critical CSS (default: true)
- `sourceMaps` - Generate source maps (default: false)
- `devMode` - Skip optimizations (default: false)
- `basePath` - Asset base path (default: "/")
- `lazyLoad` - Lazy load non-critical chunks (default: true)
- `maxChunkSize` - Max chunk size in bytes (default: 50000)

### `generateRuntime(manifest, devMode?)`

Generates only the runtime code (for HMR/dev server).

### `analyzeManifest(manifest)`

Analyzes a manifest and returns required slices.

## Bundle Size Budgets

| Page Type | Budget |
|-----------|--------|
| Static | < 5KB |
| Interactive | < 20KB |
| Complex | < 50KB |

Run size gate: `bun run js/scripts/size-gate.ts`

## Testing

```bash
# Rust tests
cargo test

# TypeScript tests
cd js && bun test

# Size gate
cd js && bun run scripts/size-gate.ts
```

## Project Structure

```
zenith-bundler/
├── src/
│   ├── lib.rs           # Main exports
│   ├── analysis.rs      # Manifest analysis
│   ├── chunking/        # Chunk computation
│   ├── codegen/         # Runtime generation
│   ├── css/             # CSS optimization
│   └── manifest/        # Types & capabilities
├── tests/
│   └── integration.rs   # Integration tests
└── js/
    ├── src/
    │   ├── index.ts     # TypeScript API
    │   ├── types.ts     # TypeScript types
    │   └── index.test.ts
    └── scripts/
        └── size-gate.ts # Bundle size CI gate
```

## License

MIT
# zenith-bundler
