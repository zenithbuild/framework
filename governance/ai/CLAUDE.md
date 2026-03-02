# Zenith Claude Contract

This file exists so Claude-compatible tools receive the same core rules as the canonical [`../../AGENTS.md`](../../AGENTS.md).

## Canonical Source
- Treat [`../../AGENTS.md`](../../AGENTS.md) as the source of truth.
- If this file and `AGENTS.md` ever conflict, follow `AGENTS.md`.
- Keep this file aligned when `AGENTS.md` or [`../../.cursorrules`](../../.cursorrules) changes.

## Infrastructure
- Zenith is not a monorepo. Each package is a separate repo and published separately.
- Respect package boundaries across compiler, bundler, runtime, router, core, and CLI.
- Favor compile-time fixes over runtime hacks.

## Non-Negotiable Rules
- Use Zenith syntax only: `on:<event>={handler}`, `state`, `signal()`, `ref<T>()`.
- Prefer pointer events and use the supported aliases: `on:hoverin`, `on:hoverout`, `on:doubleclick`, `on:esc`.
- Do not use `querySelector`, `querySelectorAll`, `getElementById`, or direct `addEventListener` in `.zen` scripts.
- Use `zenWindow()`, `zenDocument()`, `zenOn(...)`, `zenResize(...)`, and `collectRefs(...)`.
- Do not invent hidden runtime APIs, wrapper globals, selector fallbacks, or framework workarounds.
- No `onclick`, `onClick`, `@click`, `{#if}`, `{#each}`, or unbound template identifiers.

## Contracts
- Route protection uses `guard(ctx)` and `load(ctx)` in `<script server lang="ts">` or adjacent files only.
- Protected routes require SSR and cannot be statically generated.
- Tailwind contract: users put `@import "tailwindcss";` in `src/styles/globals.css`; Zenith compiles Tailwind internally in dev and build.
- Compiler diagnostics for unknown events are warnings, not hard errors.

## File Size Rule
- `500` lines is a hard limit for any source file you create or edit.
- Do not grow a file past `500` lines unless the user explicitly approves it.
- If a change approaches that limit, split the code into smaller modules/helpers/components first.
- `2k+` line source files are not acceptable as a target state for new Zenith work.
