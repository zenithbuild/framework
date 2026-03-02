# LOCKIN Plan — Zenith Component Hoisting Hard Seal

Status: IMPLEMENTED (pending review/commit)

## Scope

This lock-in covers:

- Compile-time component script hoisting semantics.
- Compiler → bundler process seam validation.
- Bundler deterministic component/runtime/page emission.
- Runtime hydration/script boundary checks.
- Integration phases 1–16 (including determinism, stress, forbidden scans).
- CI automation and dependency lock verification.

## Acceptance Criteria

1. Rust binaries build:
   - `zenith-compiler` release binary
   - `zenith-bundler` release binary
2. Integration tests pass (phases 1–16, ordered, bail on failure).
3. Component script invariants hold:
   - stable `hoist_id` for identical source
   - one emitted module per `hoist_id`
   - deterministic hydrate component instance ordering
4. No forbidden primitives in emitted assets/templates.
5. No bare `@zenithbuild/*` specifiers in emitted browser JS.
6. Dependency lock scan passes (`scripts/verify-locks.sh`).

## Commands

```bash
# binaries
(cd zenith-compiler && cargo build --release --bin zenith-compiler)
(cd zenith-bundler && cargo build --release --bin zenith-bundler)

# unit suites
(cd zenith-compiler && cargo test)
(cd zenith-bundler && cargo test)
(cd zenith-runtime && npm test -- --runInBand)

# lock verification
./scripts/verify-locks.sh

# integration
cd integration-tests
npm install
npm run test:ci
```

## Rollback Plan

Revert by package boundary to keep recovery deterministic:

1. `zenith-compiler`:
   - revert `zenith_compiler/src/{script.rs,transform.rs,compiler.rs}`
   - revert `zenith_cli/src/main.rs`
   - revert compiler hoisting tests/docs
2. `zenith-bundler`:
   - revert `src/main.rs`
   - revert updated bundler fixture/test initializers
   - revert script-boundary contract updates
3. `zenith-runtime`:
   - revert runtime export lock surface changes
   - revert hydration contract updates
4. `integration-tests`:
   - revert phases 14–16 + helper additions
   - restore `package.json` scripts
5. `root`:
   - revert `.github/workflows/ci-integration.yml`
   - revert `scripts/verify-locks.sh`
   - revert `CONTRIBUTING.md` and component model docs

After rollback, rerun the command set above to confirm restored baseline.
