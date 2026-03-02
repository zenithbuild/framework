# Zenith Agent Contract (Read before writing code)

You are generating code for the Zenith framework. Follow these rules exactly. Do not guess. Do not write vanilla framework patterns unless Zenith docs explicitly allow them.

## Events (Universal)
- Bind events on any element using `on:<event>={handler}`.
- Event names normalize to lowercase.
- Supported aliases:
  - `on:hoverin` -> `pointerenter`
  - `on:hoverout` -> `pointerleave`
  - `on:doubleclick` -> `dblclick`
  - `on:esc` -> Escape-filtered `keydown` handled by document-level dispatch
- Handler expressions must be function-valued.
- Allowed: identifier/member references and inline function expressions (arrow/function).
- Forbidden: string handlers and direct call expressions such as `on:click={doThing()}`.
- Prefer pointer events (`pointerenter/leave`, `pointerdown/up`) over mouse events.

## Reactivity Primitives
### `state`
Use `state` when changes should update DOM expressions.

```zen
state open = false
function toggle() { open = !open }
```

### `signal`
Use `signal()` for stable identity and explicit `get()` / `set()`, especially for frequent updates.

```ts
const count = signal(0)
count.set(count.get() + 1)
```

### `ref`
Use `ref<T>()` for DOM nodes (animation, measurements, focus management).
No global `document.querySelector` for root selection; scope queries to refs.

## Slots and Scope
- Slot content always retains parent reactive scope.
- Component local state must not implicitly change slot scope.

## Controlled vs Uncontrolled Components
For interactive components, support both:
- Controlled: `open` / `value` + `onOpenChange` / `onValueChange`
- Uncontrolled: `defaultOpen` / `defaultValue` internal state

Rule: if `open`/`value` is provided, it overrides internal state.

## Compiler Diagnostics
- Unknown event names are non-fatal compiler warnings with typo suggestions.
- CLI/dev tooling should print compiler diagnostics; warning origin is compiler.

## Tailwind Tokens
Use Tailwind tokens and `dark:` variants. Do not use raw CSS variables or hardcoded hex colors unless the Tailwind config defines them.

## File Size Limit
- Treat `500` lines as a hard per-file limit for source files you create or edit.
- Do not grow a file past `500` lines unless the user explicitly approves that exception.
- If a change would push a file near or over the limit, split the code into smaller modules/components/helpers first.
- If you encounter an existing file already far above the limit, prefer refactoring it downward instead of adding more code into it.
- `2k+` line files are not acceptable as an output target for new Zenith work.

## Canonical DOM + Environment Rules (Non-Negotiable)
- Use `ref<T>()` for DOM access in `.zen` scripts.
- Do not use `querySelector`, `querySelectorAll`, or `getElementById` in `.zen` scripts.
- Rare interop exception only: `// zen-allow:dom-query <reason>` on the relevant query usage.
- Use `zenOn(target, eventName, handler, options?)` for event subscriptions.
- Do not call `addEventListener` directly in `.zen` scripts.
- Use `zenWindow()` / `zenDocument()` for global DOM access.
- Do not declare custom wrappers like `runtimeWindow` / `runtimeDocument`.
- Use `zenResize(handler)` for window-resize-driven reactive updates.
- Use `collectRefs(...refs)` for deterministic multi-node operations instead of selector scans.
- If canonical primitives are insufficient, do not invent APIs or workarounds; report the missing primitive explicitly.

## Forbidden Patterns
- No `onclick="..."`, no `onClick=`, no `@click=`, no `{#if}` / `{#each}` templating.
- No unbound identifiers in markup. Every `{name}` must resolve to state, signal, ref, props, or a local const in the same file.

## Route Protection (guard/load)
- **Always** use `export const guard = async (ctx) => ...` and `export const load = async (ctx) => ...` in `<script server lang="ts">` or adjacent files (`page.guard.ts`/`page.load.ts`) for protected routes.
- **Server is Security**: Do not create generic "client-only" route guards. The Zenith router runs `guard`/`load` on the client solely for SPA UX (preventing flashes); the real security boundary is the server rendering pipeline.
- `guard(ctx)` must return `allow()`, `redirect(url)`, or `deny()`. It evaluates before anything else.
- `load(ctx)` may return `data(payload)`, `redirect(url)`, or `deny()`. It evaluates after `guard`.
- A route protected by `guard`/`load` cannot be statically generated (`prerender = true`).
