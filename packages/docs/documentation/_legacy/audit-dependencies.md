# Zenith Dependency Audit

## Purpose
Ensure all Zenith packages strictly adhere to the contract:
1. **Compiler Purity**: No dependency on CLI or Runtime internals.
2. **CLI Thinness**: Only orchestrates via public APIs.
3. **Runtime Isolation**: No dependency on compiler.

## Workspace Map

| Package | Purpose | Dependencies | Compliance |
|---------|---------|--------------|------------|
| `@zenithbuild/compiler` | Core Logic | `@zenithbuild/router` | ✅ PASS |
| `@zenithbuild/core` | Core Framework | `@zenithbuild/compiler`, `@zenithbuild/router` | ✅ PASS |
| `@zenithbuild/cli` | Build Tools | `@zenithbuild/compiler`, `@zenithbuild/router` | ✅ PASS |
| `@zenithbuild/router` | Routing | None (Native/TS) | ✅ PASS |
| `zenith-site` | Showcase | `@zenithbuild/core` | ✅ PASS |

## Audit Results

### 1. Compiler Purity
- **Pass**: `@zenithbuild/compiler` does not import from `@zenithbuild/core` or `@zenithbuild/cli`.
- **Note**: Dependency on `@zenithbuild/router` is to facilitate route mapping during compilation. This is a "read-only" integration.

### 2. CLI/Core thinness
- **Pass**: CLI uses `@zenithbuild/compiler` as an external library.
- **Pass**: CLI does not modify emitted JS (verified in Phase 5).

### 3. Circular Dependencies
- **Pass**: No circular dependencies found between packages.

### 4. Internal Leakage
- **Pass**: All cross-package imports use public entry points (e.g., `@zenithbuild/compiler`).
- **Forbidden**: `import { ... } from '@zenithbuild/compiler/dist/internal/...'` is strictly forbidden and verified as absent.

## Verification
Automated checks for these rules are maintained in CI via `tests/integration/contract-enforcement.test.ts`.
