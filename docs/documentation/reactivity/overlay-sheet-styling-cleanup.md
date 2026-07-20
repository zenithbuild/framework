---
title: "Overlay Sheet: Styling and Cleanup"
description: "Phase styling, deterministic cleanup, optional zenNavigationShell composition, and non-goals for the canonical overlay and sheet pattern."
version: "0.1"
status: "canonical"
last_updated: "2026-03-29"
tags: ["reactivity", "overlay", "sheet", "modal", "styling", "cleanup"]
nav:
  order: 19
section: "Styling and UI"
sectionOrder: 5
order: 9
---

# Overlay Sheet: Styling and Cleanup

Focused page for the [Overlay and Sheet Pattern](./overlay-sheet-pattern.md).

This page covers overlay and panel phase styling, the deterministic cleanup boundary, optional composition with `zenNavigationShell(...)`, and what this pattern does not try to solve. It is split out of the main pattern and does not introduce a second visibility system.

## Overlay and Panel Phase Styling

`zenPresence(...)` is the only visibility primitive in this pattern. The panel derives its visuals from the overlay phase:

```css
[data-overlay-root][data-zen-presence="hidden"] {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}

[data-overlay-root][data-zen-presence="entering"],
[data-overlay-root][data-zen-presence="present"] {
  opacity: 1;
  visibility: visible;
}

[data-overlay-root][data-zen-presence="exiting"] {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}

[data-overlay-panel] {
  transform: translateY(18px) scale(0.98);
  transition: transform 220ms ease;
}

[data-overlay-root][data-zen-presence="entering"] [data-overlay-panel],
[data-overlay-root][data-zen-presence="present"] [data-overlay-panel] {
  transform: translateY(0) scale(1);
}
```

That keeps overlay and panel visually aligned without adding a second phase system.

## Cleanup Example

The full canonical mount boundary is allowed to own all adjacent overlay wiring:

```zen
<script lang="ts">
import { zenPresence } from "@zenithbuild/runtime";

const open = signal(false);
const overlayRef = ref<HTMLElement>();
const panelRef = ref<HTMLElement>();
const overlayPresence = zenPresence(overlayRef, { timeoutMs: 220 });

function closeSheet() {
  open.set(false);
}

zenMount((ctx) => {
  const overlay = overlayRef.current;
  const doc = zenDocument();

  ctx.cleanup(overlayPresence.mount());

  if (overlay) {
    const offBackdrop = zenOn(overlay, "click", (event) => {
      const panel = panelRef.current;
      if (panel && event.target instanceof Node && !panel.contains(event.target)) {
        closeSheet();
      }
    });
    ctx.cleanup(offBackdrop);
  }

  if (doc) {
    const offEscape = zenOn(doc, "keydown", (event) => {
      if (event.key === "Escape" && open.get()) {
        closeSheet();
      }
    });
    ctx.cleanup(offEscape);
  }
});

zeneffect([open], () => {
  overlayPresence.setPresent(open.get());
});
</script>
```

Cleanup guarantees:
- overlay listeners are removed
- Escape listeners are removed
- owned presence listeners and timers are cleared
- stale late completions do not revive hidden overlay work

The same cleanup boundary also protects focus follow-through. There is no extra global focus registry to unwind later.

## Optional Composition with `zenNavigationShell(...)`

If an outer app shell already uses `zenNavigationShell(...)`, keep responsibilities split:
- `zenNavigationShell(...)` may style the outer route shell
- `zenPresence(...)` still owns local overlay visibility
- local open and close state remains component-owned

The shell may inform presentation around the overlay, but it does not become an overlay manager.

Router-owned navigation focus remains separate. If a real route navigation commits, the router still owns its post-navigation focus behavior. Overlay initial focus and focus return stay local to the overlay while it is open or closing.

## What This Pattern Does Not Try to Solve

- no portal system
- no generalized overlay manager
- no hidden DOM ownership
- no fragment retention
- no delayed unmount tricks
- no tabbable search or selector-based focus heuristics
- no focus-trap platform work in this first slice
- no broad dialog framework semantics
- no full accessibility framework

This is one trustworthy pattern users can copy, not a full overlay runtime.
