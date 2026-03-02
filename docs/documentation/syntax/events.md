---
title: "Events"
description: "Canonical universal event model, alias mapping, and handler validation rules for Zenith."
version: "0.3"
status: "canonical"
last_updated: "2026-02-27"
tags: ["syntax", "events", "dx"]
nav:
  order: 10
---

# Events

## ZEN-RULE-200: Universal Event Bindings

Any DOM element may bind any DOM event using `on:<event>={handler}`.

```zen
<script lang="ts">
function handleClick() {}
function handleKeydown() {}
function handleSubmit(event) { event.preventDefault(); }
function handlePointerMove() {}
</script>

<div>
  <div on:click={handleClick} on:keydown={handleKeydown}></div>
  <form on:submit={handleSubmit}></form>
  <svg on:pointermove={handlePointerMove}></svg>
</div>
```

Event names are normalized to lowercase.

## ZEN-RULE-201: Event Handler Safety

Handler expressions must be function-valued.

Allowed:
- Function references (`on:click={toggle}`)
- Member references (`on:click={actions.toggle}`)
- Inline function expressions (`on:click={(event) => submit(event)}`)

Forbidden at compile time:
- String handlers
- Direct call expressions (`on:click={doThing()}`)

## ZEN-RULE-210: Hover Aliases

Zenith supports hover sugar aliases:
- `on:hoverin` -> `pointerenter`
- `on:hoverout` -> `pointerleave`

Use CSS `:hover` for visual-only hover states. Use event bindings for logic.

## ZEN-RULE-220: Escape Alias

`on:esc` is a key-filter alias for Escape.

Runtime behavior:
- One document `keydown` listener is used when esc bindings exist.
- Dispatch runs only when `event.key === "Escape"`.
- Dispatch prefers the most-recent binding containing `document.activeElement`.
- Fallback dispatch uses the most-recent connected esc binding when focus is body or null.

## Alias Table

- `doubleclick` -> `dblclick`
- `hoverin` -> `pointerenter`
- `hoverout` -> `pointerleave`
- `esc` -> Escape-filtered keydown dispatch

Direct events like `on:pointerenter` and `on:pointerleave` remain fully supported.

## Unknown Event Names

Unknown events are non-fatal compiler warnings with typo suggestions.

Example warning:
- `warning[ZEN-EVT-UNKNOWN] Unknown DOM event 'clcik'. Did you mean 'click'?`

## Recommended Event Set

- Pointer: `pointerdown`, `pointerup`, `pointermove`, `pointerenter`, `pointerleave`
- Mouse: `click`, `dblclick`, `contextmenu`
- Keyboard: `keydown`, `keyup`, `esc`
- Form: `input`, `change`, `submit`, `focus`, `blur`
- Drag: `dragstart`, `dragover`, `drop`
- Scroll: `scroll`

## See Also

- [Bindings and Expressions](/docs/syntax/bindings-expressions)
- [Reactivity Model](/docs/reactivity/reactivity-model)
- [Zenith Contract](/docs/zenith-contract)
