# Zenith Agent Contract (Read before writing code)

You are generating code for the Zenith framework and Zenith docs. Follow these rules exactly.

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
- Forbidden: string handlers and direct call expressions like `on:click={doThing()}`.

## Reactivity Primitives
- `state`: DOM-driving reactive values.
- `signal()`: stable identity, explicit `get()`/`set()`, high-frequency or shared bindings.
- `ref<T>()`: DOM handles for scoped imperative behavior.

## Scope Rules
- Slot expressions always preserve parent scope.
- Component local state must never implicitly rebind slot expressions.

## Controlled vs Uncontrolled
Use canonical prop triplets:
- `open` / `defaultOpen` / `onOpenChange`
- `value` / `defaultValue` / `onValueChange`

Controlled props override internal state.

## Docs Rules
- Canon docs must use rule IDs and examples that compile.
- Unknown events are warnings (not hard errors), emitted by compiler diagnostics.
- Avoid forbidden syntax in docs examples.

## File Size Limit
- Treat `500` lines as a hard per-file limit for source files you create or edit.
- Do not grow a file past `500` lines unless the user explicitly approves that exception.
- If a change approaches the limit, split it into smaller modules/helpers first.
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
- No `onclick="..."`, `onClick=`, `@click=`, `{#if}`, `{#each}`.
- No free identifiers in template examples.

## Route Protection (guard/load)
- **Always** use `export const guard = async (ctx) => ...` and `export const load = async (ctx) => ...` in `<script server lang="ts">` or adjacent files (`page.guard.ts`/`page.load.ts`) for protected routes.
- **Server is Security**: Client execution of these functions is exclusively for UX flash-prevention.
- `guard(ctx)` returns `allow()`, `redirect(url)`, or `deny()`. It evaluates before `load`.
- `load(ctx)` returns `data(payload)`, `redirect(url)`, or `deny()`. It executes after `guard`.
- Protected routes inherently require SSR and fail static builds.
