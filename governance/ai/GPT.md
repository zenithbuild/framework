# Zenith GPT Contract

This file exists so GPT-compatible tools receive the same core rules as the canonical [`../../AGENTS.md`](../../AGENTS.md).

## Canonical Source
- [`../../AGENTS.md`](../../AGENTS.md) is the source of truth.
- If this file and `AGENTS.md` differ, follow `AGENTS.md`.
- Keep this file aligned when `AGENTS.md` or [`../../.cursorrules`](../../.cursorrules) changes.

## Infrastructure
- Zenith is not a monorepo. Each package is a separate repo and published separately.
- Respect package boundaries across compiler, bundler, runtime, router, core, and CLI.
- Prefer compile-time fixes over runtime hacks.

## Core Rules
- Use Zenith syntax and canonical primitives only: `on:<event>={handler}`, `state`, `signal()`, `ref<T>()`.
- Prefer pointer events and the supported aliases `on:hoverin`, `on:hoverout`, `on:doubleclick`, and `on:esc`.
- Do not use selector hacks or direct DOM listeners in `.zen` scripts.
- Use `zenWindow()`, `zenDocument()`, `zenOn(...)`, `zenResize(...)`, and `collectRefs(...)`.
- No `onclick`, `onClick`, `@click`, `{#if}`, `{#each}`, or unbound template identifiers.

## Contracts
- Route protection uses `guard(ctx)` and `load(ctx)` in server script space only.
- Protected routes require SSR and cannot be statically generated.
- Tailwind contract: users author `@import "tailwindcss";` in `src/styles/globals.css`; Zenith compiles it internally in dev and build.

## File Size Rule
- `500` lines is the hard maximum for any source file you create or edit.
- Do not push files past `500` lines unless the user explicitly approves an exception.
- Split code into smaller files before it reaches the limit.
- `2k+` line files are not acceptable for new Zenith work.
