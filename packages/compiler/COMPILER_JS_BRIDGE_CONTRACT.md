# Zenith Compiler JS Bridge Contract (V0)

Status: FROZEN (V0)

## Identity

`@zenithbuild/compiler` is a deterministic Rust execution bridge.

## Allowed Responsibilities

- Invoke the Rust compiler binary with deterministic arguments.
- Parse Rust compiler JSON stdout.
- Throw deterministic errors on non-zero exit or invalid JSON output.

## Explicit Non-Responsibilities

- It does not parse AST.
- It does not transform IR.
- It does not contain compiler logic.
- It does not import other Zenith layers.

## Explicit Prohibitions

- No `eval`.
- No browser globals.
- No dynamic imports.
- No bundler/runtime knowledge.
- No CLI orchestration logic.

## Boundary

This package only invokes the Rust binary and returns parsed JSON.
