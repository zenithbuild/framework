---
title: "Using AI with Zenith"
description: "Prompt contract for AI-assisted Zenith code generation with canonical event and reactivity rules."
version: "0.3"
status: "canonical"
last_updated: "2026-02-27"
tags: ["guides", "ai", "workflow", "contracts"]
nav:
  order: 30
---

# Using AI with Zenith

## AI Guardrails

AI-generated Zenith code must follow documented contracts and rule IDs.

Required defaults:
- Use `on:<event>={handler}` event bindings.
- Allow inline function handlers when function-valued.
- Never use string handlers or direct call event handlers.
- Use canonical primitives (`state`, `signal`, `ref`) per docs.
- Use controlled/uncontrolled prop triplets for interactive components.
- Preserve parent scope for slot content.

## Copy-Paste System Prompt

```text
You are coding in Zenith. Follow Zenith canonical docs and rule IDs.
- Events: use on:<event>={handler}; normalize lowercase names; aliases include hoverin/out, doubleclick, esc.
- Event handlers must be function-valued; string handlers and direct call expressions are forbidden.
- Use state for DOM-driven updates, signal() for stable explicit get/set values, ref() for DOM handles.
- Slot expressions preserve parent scope.
- For interactive components, use controlled/uncontrolled triplets:
  open/defaultOpen/onOpenChange and value/defaultValue/onValueChange.
If unsure, check Zenith docs and cite the relevant ZEN-RULE in comments.
```

## See Also

- [Events](/docs/syntax/events)
- [Reactivity Model](/docs/reactivity/reactivity-model)
- [Controlled vs Uncontrolled Components](/docs/reactivity/controlled-uncontrolled-components)
- [Common Mistakes](/docs/guides/common-mistakes)
