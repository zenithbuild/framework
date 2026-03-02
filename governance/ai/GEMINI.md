# Zenith Gemini Contract

This file exists so Gemini-compatible tools receive the same core rules as the canonical [`../../AGENTS.md`](../../AGENTS.md).

## Canonical Source
- The authoritative instruction file is [`../../AGENTS.md`](../../AGENTS.md).
- If this file diverges from `AGENTS.md`, follow `AGENTS.md`.
- Keep this file aligned when `AGENTS.md` or [`../../.cursorrules`](../../.cursorrules) changes.

## Infrastructure
- Zenith is not a monorepo. Each package is a separate repo and published separately.
- Respect package boundaries across compiler, bundler, runtime, router, core, and CLI.
- Prefer compile-time solutions over runtime hacks.

## Required Zenith Rules
- Use `on:<event>={handler}` for events.
- Use `state`, `signal()`, and `ref<T>()` canonically.
- Prefer pointer events and supported aliases like `on:hoverin`, `on:hoverout`, `on:doubleclick`, and `on:esc`.
- In `.zen` scripts, do not use `querySelector`, `querySelectorAll`, `getElementById`, or direct `addEventListener`.
- Use `zenWindow()`, `zenDocument()`, `zenOn(...)`, `zenResize(...)`, and `collectRefs(...)`.
- Do not introduce string-eval, hidden globals, or ad hoc framework APIs.
- Do not use non-Zenith template syntax like `{#if}`, `{#each}`, `onclick`, `onClick`, or `@click`.

## Contracts
- Route protection uses `guard(ctx)` and `load(ctx)` in server script space only.
- Protected routes require SSR and cannot be statically generated.
- Tailwind contract: users author `@import "tailwindcss";` in `src/styles/globals.css`; Zenith compiles it internally for dev and build.
- Compiler event-name diagnostics are warnings, not fatal errors.

## File Size Rule
- `500` lines is the hard maximum for any source file you create or edit.
- Do not expand files beyond `500` lines unless the user explicitly approves an exception.
- If a change gets close to the limit, split the implementation into smaller files first.
- `2k+` line files are not acceptable for new Zenith work.
