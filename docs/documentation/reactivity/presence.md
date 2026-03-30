---
title: "Presence"
description: "Canonical guidance for ref-owned presence with zenPresence and the optional presence alias."
version: "0.1"
status: "canonical"
last_updated: "2026-03-29"
tags: ["reactivity", "presence", "transitions", "runtime"]
nav:
  order: 13
---

# Presence

## Contract Boundary

`zenPresence(...)` is the canonical Zenith helper for ref-owned presence on always-mounted nodes.

It exists to remove repetitive transition boilerplate while staying inside the Phase 1 and Phase 2 runtime boundaries:
- `ref` owns the node
- `zenMount(...)` owns mount-time setup
- `zeneffect(...)` drives reactive visibility
- cleanup remains deterministic

`presence(...)` is an optional convenience alias. It is never the public-first name.

## What `zenPresence` Does

`zenPresence(ref, options)` manages four explicit phases on the node itself through `data-zen-presence`:
- `hidden`
- `entering`
- `present`
- `exiting`

It:
- starts entry only after the `zenMount(...)` boundary
- listens for owned `transitionend` and `animationend`
- falls back to a deterministic timeout when no end event fires
- cancels prior listeners and timers on rerun
- leaves no ghost work after cleanup
- may notify local phase changes through `onPhaseChange(phase, context)` for narrow node-owned follow-through such as overlay focus handoff

## What `zenPresence` Does Not Do

- no fragment retention
- no delayed unmount of conditional markup
- no router coupling
- no hidden DOM ownership
- no general animation framework semantics

## Overlay / Sheet Composition

The canonical overlay and sheet pattern is:
- one always-mounted overlay root
- one always-mounted panel
- one `zenPresence(...)` controller on the overlay root
- backdrop and Escape wiring inside `zenMount(...)`

See [Overlay and Sheet Pattern](/docs/reactivity/overlay-sheet-pattern) for the full pattern, including backdrop click, Escape, cleanup, and the optional outer-shell note for `zenNavigationShell(...)`.

That same pattern now covers initial focus and focus return by using explicit opener and initial-focus refs with `onPhaseChange`, rather than adding a second helper surface.

## Minimal Pattern

Use `zenPresence(...)` first:

```zen
<script lang="ts">
import { zenPresence } from "@zenithbuild/runtime";

const open = signal(false);
const panelRef = ref<HTMLElement>();
const panelPresence = zenPresence(panelRef, { timeoutMs: 220 });

function togglePanel() {
  open.set(!open.get());
}

zenMount((ctx) => {
  ctx.cleanup(panelPresence.mount());
});

zeneffect([open], () => {
  panelPresence.setPresent(open.get());
});
</script>

<button on:click={togglePanel}>Toggle panel</button>
<div ref={panelRef}>
  Presence-managed content
</div>
```

## Optional Alias

`presence(...)` is a secondary alias only:

```zen
<script lang="ts">
import { presence } from "@zenithbuild/runtime";

const visible = signal(false);
const toastRef = ref<HTMLElement>();
const toastPresence = presence(toastRef, { timeoutMs: 180 });

function showToast() {
  visible.set(true);
}

zenMount((ctx) => {
  ctx.cleanup(toastPresence.mount());
});

zeneffect([visible], () => {
  toastPresence.setPresent(visible.get());
});
</script>

<button on:click={showToast}>Show toast</button>
<aside ref={toastRef}>Saved</aside>
```

## Class-Based Transition Example

The helper owns phase truth. Your CSS owns the visual treatment:

```zen
<script lang="ts">
import { zenPresence } from "@zenithbuild/runtime";

const expanded = signal(false);
const cardRef = ref<HTMLElement>();
const cardPresence = zenPresence(cardRef, { timeoutMs: 240 });

function toggleCard() {
  expanded.set(!expanded.get());
}

zenMount((ctx) => {
  ctx.cleanup(cardPresence.mount());
});

zeneffect([expanded], () => {
  cardPresence.setPresent(expanded.get());
});
</script>

<style>
[data-demo-card][data-zen-presence="hidden"] {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
  pointer-events: none;
}

[data-demo-card][data-zen-presence="entering"],
[data-demo-card][data-zen-presence="present"] {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition: opacity 240ms ease, transform 240ms ease;
}

[data-demo-card][data-zen-presence="exiting"] {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
  transition: opacity 240ms ease, transform 240ms ease;
}
</style>

<button on:click={toggleCard}>Toggle card</button>
<section ref={cardRef} data-demo-card>
  Animated card body
</section>
```

## Timeout Fallback Example

`timeoutMs` exists for cases where CSS timing is missing, inconsistent, or intentionally eventless:

```zen
<script lang="ts">
import { zenPresence } from "@zenithbuild/runtime";

const active = signal(false);
const bannerRef = ref<HTMLElement>();
const bannerPresence = zenPresence(bannerRef, { timeoutMs: 400 });

function activateBanner() {
  active.set(true);
}

zenMount((ctx) => {
  ctx.cleanup(bannerPresence.mount());
});

zeneffect([active], () => {
  bannerPresence.setPresent(active.get());
});
</script>

<button on:click={activateBanner}>Activate banner</button>
<div ref={bannerRef}>
  Timeout-backed presence
</div>
```

If no owned `transitionend` or `animationend` arrives, the helper settles after the fallback timeout.

## Cleanup and Disposal Example

`zenMount(...)` remains the right lifecycle boundary because it owns both the presence controller mount and any adjacent node-local side effects:

```zen
<script lang="ts">
import { zenPresence } from "@zenithbuild/runtime";

const open = signal(false);
const sheetRef = ref<HTMLElement>();
const sheetPresence = zenPresence(sheetRef, { timeoutMs: 220 });

function closeSheet() {
  open.set(false);
}

zenMount((ctx) => {
  const doc = zenDocument();
  ctx.cleanup(sheetPresence.mount());

  if (doc) {
    const offKey = zenOn(doc, "keydown", (event) => {
      if (event.key === "Escape") {
        closeSheet();
      }
    });
    ctx.cleanup(offKey);
  }
});

zeneffect([open], () => {
  sheetPresence.setPresent(open.get());
});
</script>

<aside ref={sheetRef}>
  Esc closes this sheet.
</aside>
```

Cleanup guarantees:
- pending listeners are removed
- pending timers are cleared
- stale completion callbacks do not advance phase after teardown

For overlay and sheet work, keep the same rule: mount the presence controller, then attach backdrop and Escape listeners in that same `zenMount(...)` scope so one cleanup boundary owns the whole surface.

For focus follow-through, keep the rule equally narrow: use `onPhaseChange` to move focus to an explicit local ref on open and back to the opener ref on close. Do not broaden that into selector scans, focus trapping, or overlay-global state.

## Timing Model

The canonical lifecycle is:
1. create the controller once
2. register `presence.mount()` inside `zenMount(...)`
3. feed boolean state through `presence.setPresent(...)`
4. let owned end events or timeout settle the phase

This keeps presence inside the existing deterministic runtime model rather than inventing a second framework.
