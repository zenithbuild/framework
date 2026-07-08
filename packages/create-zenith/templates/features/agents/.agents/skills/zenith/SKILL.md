---
name: zenithbuild
description: Canonical agent rules, examples, and detection guidance for building Zenith framework projects.
---

# Zenith Agent Skill

This file is the canonical quick-start for any coding agent working on a Zenith framework project.

## 1. What Zenith Is

Zenith is a compiler-first UI framework.

- Zenith resolves structure, scope, and binding intent at compile time whenever possible.
- Components are structural composition boundaries, not hidden runtime state containers.
- Familiar-looking syntax does not imply React, Vue, or Svelte semantics.
- Slot ownership, routing, hydration, and DOM access follow Zenith contracts, not generic framework conventions.
- If a behavior is unclear, read the contract before writing code. Do not guess or import non-Zenith patterns.

## 2. Where To Look First

Read in this order unless the task is clearly narrower:

1. `SKILL.md` — fastest path to non-negotiable authoring rules.
2. `rules/zenith-agent-contract.md` — concise contract summary.
3. `rules/zenith-dom-rules.md` — refs, `zenWindow`, `zenDocument`, `zenOn`, `zenResize`, `collectRefs`.
4. `rules/zenith-routing-rules.md` — `guard` / `load`, server-first security.
5. `rules/zenith-tailwind-rules.md` — Tailwind tokens and `dark:` variants.
6. `examples/*.zen` — minimal, correct examples.

## 3. Zenith Syntax And Coding Rules

### Events

- Bind DOM events with `on:<event>={handler}`.
- Event names normalize to lowercase.
- Supported aliases: `hoverin` -> `pointerenter`, `hoverout` -> `pointerleave`, `doubleclick` -> `dblclick`, `esc` -> filtered `keydown`.
- Handlers must be function-valued: identifiers, member references, or inline functions.
- Forbidden: string handlers and direct calls like `on:click={save()}`.
- Prefer pointer events over mouse events when possible.

### Reactivity primitives

- `state` — drives DOM updates directly.
- `signal()` — stable identity plus explicit `get()` / `set()`, especially for frequent updates.
- `ref<T>()` — DOM handles, focus, measurement, animation.

### Scope and component rules

- Slot content always preserves parent reactive scope.
- Component-local state does not silently rebind slot expressions.
- Interactive components support controlled and uncontrolled patterns:
  - `open` / `defaultOpen` / `onOpenChange`
  - `value` / `defaultValue` / `onValueChange`
- If `open` or `value` is provided, it overrides internal state.

### Canonical DOM and environment rules for `.zen`

- Use `ref<T>()` for DOM access.
- Do not use `querySelector`, `querySelectorAll`, or `getElementById` in `.zen` scripts.
- Rare interop exception: annotate with `// zen-allow:dom-query <reason>`.
- Use `zenOn(...)` instead of direct `addEventListener(...)`.
- Use `zenWindow()` and `zenDocument()` for global browser access.
- Use `zenResize(...)` for resize-driven updates.
- Use `collectRefs(...refs)` for deterministic multi-node operations.

### Styling

- Use Tailwind tokens and `dark:` variants.
- Do not hardcode raw hex colors unless the Tailwind theme defines them.
- Avoid generic CSS patterns when Zenith/Tailwind rules already exist.

### Routing and security

- Protected routes use server `guard(ctx)` and `load(ctx)` exports.
- `guard(ctx)` must return `allow()`, `redirect(url)`, or `deny()`.
- `load(ctx)` may return `data(payload)`, `redirect(url)`, or `deny()`.
- Security lives on the server. Client-side guard/load execution is UX-only.
- Do not create generic client-only route guards.
- Routes using `guard` or `load` cannot use `prerender = true`.

### Forbidden patterns

- `onclick="..."`, `onClick=`, `@click=`, `{#if}` / `{#each}` templating.
- Direct call handlers: `on:click={doThing()}`.
- React, Vue, Svelte, or Astro syntax.
- Invented Zenith APIs or generic framework patterns unless explicitly allowed.
- Source files over 500 lines without approval.

## 4. When In Doubt

Stop and read the contract. Do not invent APIs. Do not fall back to framework-agnostic patterns. Report the missing primitive or ask for clarification.
