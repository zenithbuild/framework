---
title: "Common Mistakes"
description: "Frequent Zenith authoring errors and the canonical fixes."
version: "0.3"
status: "canonical"
last_updated: "2026-02-27"
tags: ["guides", "troubleshooting", "contracts"]
nav:
  order: 40
---

# Common Mistakes

## 1. Unbound Identifiers in Markup

Problem:

```text
<h1>{headingText}</h1>
```

If `headingText` is not declared in scope, compile-time diagnostics should fail.

Fix:
- Declare the identifier locally.
- Or reference an explicit source such as `props.headingText`.

## 2. Direct-Call Event Handlers

Problem:
- Calling a handler during render instead of passing a function value.
- Zenith rejects direct-call handler expressions at compile time.

Fix:

```zen
<script lang="ts">
function save() {}
</script>

<div>
  <button on:click={save}>Save</button>
  <button on:click={() => save()}>Save</button>
</div>
```

## 3. Legacy Hover Event Names

Problem:

Using legacy mouse hover bindings for logic causes drift from canonical docs.

Fix:
- Use `on:hoverin` / `on:hoverout` (aliases for pointer events).
- Or use `on:pointerenter` / `on:pointerleave` directly.

## 4. Component Event Forwarding Assumptions

Problem:

Binding events on a component tag does not automatically forward DOM events unless the component contract forwards them.

Fix:
- Bind events on DOM elements inside the component.
- Expose explicit callback props for parent-driven behavior.

## 5. Controlled vs Uncontrolled Mixing

Problem:

Passing `open` without proper `onOpenChange` handling can create confusing ownership.

Fix:
- Use full controlled triplet (`open` + `onOpenChange`).
- Or use uncontrolled (`defaultOpen`) without external source-of-truth props.

## See Also

- [Events](/docs/syntax/events)
- [Bindings and Expressions](/docs/syntax/bindings-expressions)
- [Controlled vs Uncontrolled Components](/docs/reactivity/controlled-uncontrolled-components)
