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

## Forbidden Patterns
- No `onclick="..."`, `onClick=`, `@click=`, `{#if}`, `{#each}`.
- No free identifiers in template examples.
