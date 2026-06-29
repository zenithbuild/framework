---
title: "Overlay Sheet: Focus and Dismissal"
description: "Focus follow-through, backdrop dismissal, and Escape handling for the canonical always-mounted overlay and sheet pattern."
version: "0.1"
status: "canonical"
last_updated: "2026-03-29"
tags: ["reactivity", "overlay", "sheet", "modal", "focus", "dismissal"]
nav:
  order: 15
---

# Overlay Sheet: Focus and Dismissal

Focused page for the [Overlay and Sheet Pattern](./overlay-sheet-pattern.md).

This page covers the narrow focus follow-through and dismissal surface behavior split out of the main pattern. It uses only the canonical primitives from the overview: `ref`, `zenMount(...)`, `zenPresence(...)`, and deterministic cleanup. It does not introduce a focus trap, overlay stack, or dialog manager.

## Initial Focus Example

The narrow canonical target is a specific ref, usually the primary action or the first intentional control inside the surface:

```zen
<script lang="ts">
import { zenPresence } from "@zenithbuild/runtime";

const open = signal(false);
const openerRef = ref<HTMLButtonElement>();
const overlayRef = ref<HTMLElement>();
const initialFocusRef = ref<HTMLButtonElement>();

function focusIfAvailable(node: HTMLElement | null | undefined) {
  if (!node || !node.isConnected || typeof node.focus !== "function") {
    return;
  }

  try {
    node.focus({ preventScroll: true });
  } catch {
    try {
      node.focus();
    } catch {
    }
  }
}

const overlayPresence = zenPresence(overlayRef, {
  timeoutMs: 220,
  onPhaseChange(phase, context) {
    if (phase === "present" && context.previousPhase === "entering") {
      focusIfAvailable(initialFocusRef.current);
    }
  },
});
</script>

<button ref={openerRef}>Open sheet</button>
<div ref={overlayRef} data-overlay-root>
  <aside data-overlay-panel>
    <button ref={initialFocusRef}>Done</button>
  </aside>
</div>
```

Why this is the default:
- focus lands on an explicit, user-meaningful control
- timing stays local to the overlay phase model
- no selector scanning or tabbable search is required

If your design needs immediate handoff before the entry timing settles, you may react to `entering` instead. The default documented pattern uses `present` so focus moves after the surface has visibly arrived.

## Backdrop Click Example

Backdrop dismissal belongs in `zenMount(...)` because it is node wiring, not reactive derivation:

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
});
</script>
```

Why this is the canonical backdrop rule:
- no selector scanning
- no hidden ownership
- overlay and panel are both explicit refs
- cleanup remains local and deterministic

## Escape Example

Escape is the same kind of mount-owned behavior:

```zen
<script lang="ts">
import { zenPresence } from "@zenithbuild/runtime";

const open = signal(false);
const overlayRef = ref<HTMLElement>();
const overlayPresence = zenPresence(overlayRef, { timeoutMs: 220 });

function closeSheet() {
  open.set(false);
}

zenMount((ctx) => {
  const doc = zenDocument();
  ctx.cleanup(overlayPresence.mount());

  if (doc) {
    const offEscape = zenOn(doc, "keydown", (event) => {
      if (event.key === "Escape" && open.get()) {
        closeSheet();
      }
    });
    ctx.cleanup(offEscape);
  }
});
</script>
```

Use `zenDocument()` and `zenOn(...)`. Do not fall back to `document.addEventListener(...)`.

## Focus Return Example

Return focus only after the surface finishes closing:

```zen
<script lang="ts">
import { zenPresence } from "@zenithbuild/runtime";

const open = signal(false);
const openerRef = ref<HTMLButtonElement>();
const overlayRef = ref<HTMLElement>();
const initialFocusRef = ref<HTMLButtonElement>();

function focusIfAvailable(node: HTMLElement | null | undefined) {
  if (!node || !node.isConnected || typeof node.focus !== "function") {
    return;
  }

  try {
    node.focus({ preventScroll: true });
  } catch {
    try {
      node.focus();
    } catch {
    }
  }
}

const overlayPresence = zenPresence(overlayRef, {
  timeoutMs: 220,
  onPhaseChange(phase, context) {
    if (phase === "present" && context.previousPhase === "entering") {
      focusIfAvailable(initialFocusRef.current);
    }

    if (phase === "hidden" && context.previousPhase === "exiting") {
      focusIfAvailable(openerRef.current);
    }
  },
});
</script>
```

Safe fallback rule:
- if the opener ref no longer points at a connected focusable node, do nothing
- do not search the document for a substitute
- do not invent overlay-global focus recovery rules in this slice

This keeps focus return local and deterministic.
