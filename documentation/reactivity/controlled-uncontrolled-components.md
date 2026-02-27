---
title: "Controlled vs Uncontrolled Components"
description: "Canonical controlled/uncontrolled resolution algorithm and naming conventions for Zenith components."
version: "0.3"
status: "canonical"
last_updated: "2026-02-27"
tags: ["reactivity", "components", "api-design"]
---

# Controlled vs Uncontrolled Components

## Contract: Resolution Algorithm

Contract: stateful components must support hybrid control without heavy runtime overhead.

Invariant: if control prop is provided, it wins; otherwise local state is used.

Definition of Done:
- `isControlled = prop !== undefined`
- `actual = isControlled ? prop : local`
- `set(next)` updates local only when uncontrolled and emits `onXChange` when provided.

## Naming Convention

Use these canonical prop triplets:

- `open` / `defaultOpen` / `onOpenChange`
- `value` / `defaultValue` / `onValueChange`

## Flagship Example: Nav API Shape

```ts
export interface NavProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (nextOpen: boolean) => void;
}
```

```ts
function resolveOpen(open: boolean | undefined, localOpen: boolean) {
  return open !== undefined ? open : localOpen;
}

function setOpen(
  nextOpen: boolean,
  open: boolean | undefined,
  setLocalOpen: (next: boolean) => void,
  onOpenChange?: (next: boolean) => void,
) {
  if (open === undefined) {
    setLocalOpen(nextOpen);
  }
  if (typeof onOpenChange === "function") {
    onOpenChange(nextOpen);
  }
}
```

## Usage Examples

Uncontrolled:

```text
<Navigation></Navigation>
<Navigation defaultOpen={true}></Navigation>
```

Controlled:

```text
<Navigation open={isOpen} onOpenChange={setIsOpen}></Navigation>
```

## See Also

- [Reactivity Model](/docs/reactivity/reactivity-model)
- [Using AI with Zenith](/docs/guides/using-ai-with-zenith)
