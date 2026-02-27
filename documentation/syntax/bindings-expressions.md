---
title: "Bindings and Expressions"
description: "Canonical event binding, expression binding, and free-identifier safety rules for Zenith templates."
version: "0.3"
status: "canonical"
last_updated: "2026-02-27"
tags: ["syntax", "bindings", "expressions"]
---

# Bindings and Expressions

## Contract: Event Bindings

Contract: Zenith event bindings are object-based.

Invariant: handlers must be bound with `on:event={handler}`.

Banned:
- `onclick` string attributes
- `onClick` React-style props
- `@click` Vue-style attributes

Definition of Done:
- Template events use only `on:*={...}`.
- Handler identifiers resolve in local script scope.

## Contract: Expression Bindings

Contract: bound expressions are explicit JavaScript expressions in `{...}`.

Invariant: identifiers used in expressions must be declared in the same component scope (or be explicit property access like `props.title`).

Definition of Done:
- `href={expr}`, `class={expr}`, `{value}` are valid when `expr`/`value` are declared.
- No free identifiers are present in public docs examples.

## Compile-Safe Example

```zen
<script lang="ts">
const label = "Menu";
function handleToggle() {}
</script>

<button on:click={handleToggle}>{label}</button>
```

## See Also

- [DSL Syntax Contract](/docs/contracts/dsl-syntax)
- [Reactivity Model](/docs/reactivity/reactivity-model)
