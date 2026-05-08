---
title: "Bindings and Expressions"
description: "Canonical expression binding rules, event handler contracts, and identifier safety for Zenith templates."
version: "0.3"
status: "canonical"
last_updated: "2026-05-08"
tags: ["syntax", "bindings", "expressions"]
nav:
  order: 20
---

# Bindings and Expressions

## Event Binding Contract

Use `on:<event>={handler}` for event bindings.

- Event names are normalized to lowercase.
- Alias mapping follows [Events](/docs/syntax/events).
- Handler expressions must be function-valued.

Allowed examples:

```zen
<script lang="ts">
function toggle() {}
function submit(event) { return event; }
function close() {}
</script>

<div>
  <button on:click={toggle}>Toggle</button>
  <button on:click={(event) => submit(event)}>Submit</button>
  <div on:esc={close}></div>
</div>
```

Compile-time errors:
- String handlers
- Direct call handler expressions (`on:click={doThing()}`)
- Equivalent direct-call forms hidden behind parentheses, computed access, optional calls, or chained expressions.

## Expression Binding Contract

Bound expressions are explicit JavaScript expressions in `{...}`.

Identifiers must resolve in local component scope, props, or explicit runtime bindings.

The compiler validates script syntax, markup expression syntax, and clearly unbound markup identifiers before code generation. These failures use structured diagnostics:

- `ZEN-SCRIPT-SYNTAX` for invalid `<script lang="ts">` syntax.
- `ZEN-EXPR-SYNTAX` for invalid markup or attribute expression syntax.
- `ZEN-EXPR-UNBOUND` when a markup expression references a root identifier that is not in scope.
- `ZEN-MARKUP-PARSE` for malformed markup such as mismatched tags or unexpected EOF.

Definition of done:
- `href={expr}`, `class={expr}`, `{value}` are valid only when identifiers resolve.
- Public docs examples must not contain free identifiers.

## Compile-Safe Example

```zen
<script lang="ts">
const label = "Menu";
function handleToggle() {}
</script>

<button on:click={handleToggle}>{label}</button>
```

## See Also

- [Events](/docs/syntax/events)
- [Reactivity Model](/docs/reactivity/reactivity-model)
- [Common Mistakes](/docs/guides/common-mistakes)
