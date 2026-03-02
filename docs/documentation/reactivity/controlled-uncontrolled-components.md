---
title: "Controlled vs Uncontrolled Components"
description: "Canonical controlled/uncontrolled contract and prop naming conventions for interactive Zenith components."
version: "0.3"
status: "canonical"
last_updated: "2026-02-27"
tags: ["reactivity", "components", "api-design"]
nav:
  order: 20
---

# Controlled vs Uncontrolled Components

## ZEN-RULE-320: Controlled Props Override Internal State

Interactive components should support both controlled and uncontrolled usage.

Canonical prop triplets:
- `open` / `defaultOpen` / `onOpenChange`
- `value` / `defaultValue` / `onValueChange`

Resolution algorithm:
- If `open`/`value` is provided, it is the source of truth.
- Otherwise internal state is used.
- On any state transition, emit `onOpenChange` / `onValueChange` when provided.

## Example

```ts
function resolveOpen(open, localOpen) {
  return open !== undefined ? open : localOpen;
}

function setOpen(nextOpen, open, setLocalOpen, onOpenChange) {
  if (open === undefined) {
    setLocalOpen(nextOpen);
  }
  if (typeof onOpenChange === "function") {
    onOpenChange(nextOpen);
  }
}
```

## Usage

Uncontrolled:

```text
<Navigation />
<Navigation defaultOpen={true} />
```

Controlled:

```text
<Navigation open={isOpen} onOpenChange={setIsOpen} />
```

## See Also

- [Reactivity Model](/docs/reactivity/reactivity-model)
- [Using AI with Zenith](/docs/guides/using-ai-with-zenith)
- [Zenith Contract](/docs/zenith-contract)
