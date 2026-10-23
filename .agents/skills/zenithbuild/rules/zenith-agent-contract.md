# Zenith Agent Contract

These rules are non-negotiable when generating code for the Zenith framework.

## Events

- Bind events with `on:<event>={handler}`.
- Aliases: `hoverin` -> `pointerenter`, `hoverout` -> `pointerleave`, `doubleclick` -> `dblclick`, `esc` -> filtered `keydown`.
- Handlers must be function-valued identifiers, member references, or inline functions.
- Forbidden: string handlers and direct calls like `on:click={doThing()}`.
- Prefer pointer events over mouse events.

## Reactivity

- `state` for DOM-driven reactive values.
- `signal()` for stable identity with explicit `get()` / `set()`.
- `ref<T>()` for DOM node handles.

## Slots and scope

- Slots keep parent reactive scope.
- Component state does not implicitly rebind slot expressions.

## Controlled / uncontrolled

- Support `open` / `defaultOpen` / `onOpenChange` and `value` / `defaultValue` / `onValueChange`.
- Provided `open`/`value` always overrides internal state.

## Tailwind

- Use Tailwind tokens and `dark:` variants.
- Avoid raw CSS variables and hardcoded hex colors unless defined in the Tailwind config.

## File size

- Hard limit: 500 lines per source file.
- Split files instead of growing past the limit.
- `2k+` line files are unacceptable for new Zenith work.

## Forbidden patterns

- `onclick="..."`, `onClick=`, `@click=`, `{#if}` / `{#each}` templating.
- Direct call handlers.
- React, Vue, Svelte, Astro syntax.
- Unbound identifiers in markup.
- Invented Zenith APIs or generic patterns unless explicitly allowed.
