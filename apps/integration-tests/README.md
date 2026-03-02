# Zenith V0 Integration Validation Suite

Process-boundary validation for the sealed Zenith V0 stack.

## Scope

- Compiler and bundler are process seams (Rust binaries).
- CLI is orchestration only (spawns compiler and bundler).
- Bundler owns script emission/injection and runtime/router asset wiring.
- Runtime validates hydration payloads and executes explicit bootstrap only.

## Local Run

```bash
# from workspace root
(cd zenith-compiler && cargo build --release --bin zenith-compiler)
(cd zenith-bundler && cargo build --release --bin zenith-bundler)

cd integration-tests
npm install
npm test -- --runInBand
```

## CI-equivalent Run

```bash
cd integration-tests
npm run test:ci
```

`test:ci` runs phases 1–16 in strict order with `--bail`, so contract drift fails fast.

## Optional Environment Overrides

- `ZENITH_COMPILER_BIN`: Absolute path to compiler binary.
- `ZENITH_BUNDLER_BIN`: Absolute path to bundler binary.
- `ZENITH_BUNDLER_ARGS`: JSON string array for bundler CLI args. Use `$OUT_DIR` placeholder for output directory.

Example:

```bash
ZENITH_BUNDLER_ARGS='["--out-dir","$OUT_DIR"]' npm test -- --runInBand
```
