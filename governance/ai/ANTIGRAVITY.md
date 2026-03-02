# Zenith Anti-Gravity Contract

This file mirrors the core workspace rules for Anti-Gravity style agent workflows.

## Canonical Source
- [`../../AGENTS.md`](../../AGENTS.md) is the source of truth.
- [`../../.cursorrules`](../../.cursorrules) contains the orchestrator/governor workflow layer.
- Keep this file aligned when either source changes.

## Infrastructure
- Zenith is not a monorepo. Each package is a separate repo and published separately.
- Anti-Gravity/orchestrator workflows must respect package boundaries across compiler, bundler, runtime, router, core, and CLI.

## Hard Rules
- Stay inside Zenith syntax and canonical DOM/runtime primitives.
- Use `on:<event>={handler}`, `state`, `signal()`, and `ref<T>()` canonically.
- No selector hacks, no direct DOM listeners in `.zen` scripts, no hidden runtime APIs.
- Route protection stays in `guard(ctx)` and `load(ctx)` server contract space.
- Tailwind contract is globals-only: `src/styles/globals.css` with `@import "tailwindcss";`, compiled internally by Zenith.

## File Size Rule
- `500` lines is a hard limit for any source file you create or edit.
- Do not accept `2k+` line files as a target state for new work.
- Split code before the file crosses the limit unless the user explicitly approves an exception.
