---
title: "Navigation Shell"
description: "Canonical guidance for zenNavigationShell as a tiny visual shell utility on top of the existing router lifecycle."
version: "0.1"
status: "canonical"
last_updated: "2026-03-29"
tags: ["routing", "navigation", "shell", "transitions"]
nav:
  order: 42
---

# Navigation Shell

## Contract Boundary

`zenNavigationShell(...)` is the canonical tiny visual shell utility for route-level visuals on top of the existing router lifecycle.

It exists to remove repetitive lifecycle glue while keeping the router contract unchanged:
- it listens to the existing lifecycle only
- it owns visual shell state only
- it stays on an always-mounted shell node
- it resets on `navigation:abort` and `navigation:error`

It is not a route animation framework.

## What `zenNavigationShell` Does

`zenNavigationShell(ref, options)` projects a small explicit phase model onto one shell node:
- `idle`
- `leaving`
- `swapping`
- `entering`

It also exposes state through `getState()`:
- `phase`
- `navigationId`
- `navigationType`

The helper writes shell metadata directly onto the owned node:
- `data-zen-navigation-phase`
- `data-zen-navigation-id`
- `data-zen-navigation-type`

## Lifecycle Mapping

The utility does not invent new hooks. It layers on top of the existing router lifecycle:
- `navigation:before-leave` -> `leaving`
- `navigation:before-swap` -> `swapping`
- `navigation:before-enter` -> `entering`
- `navigation:abort` -> reset to `idle`
- `navigation:error` -> reset to `idle`

Only `before-leave`, `before-swap`, and `before-enter` are awaited visual barriers.

## What `zenNavigationShell` Does Not Do

- no route truth ownership
- no redirect or deny reinterpretation
- no fragment retention
- no delayed unmount logic
- no second transition framework
- no generalized shell runtime
- no page animation system

## Minimal Pattern

```zen
<script lang="ts">
import { zenNavigationShell } from "@zenithbuild/router";

const shellRef = ref<HTMLElement>();
const shell = zenNavigationShell(shellRef, { timeoutMs: 180 });

zenMount((ctx) => {
  ctx.cleanup(shell.mount());
});
</script>

<div ref={shellRef} class="min-h-screen">
  <nav class="flex gap-3">
    <a data-zen-link="true" href="/">Home</a>
    <a data-zen-link="true" href="/about">About</a>
  </nav>
  <main class="mt-6">
    Route content stays owned by the router.
  </main>
</div>
```

## Shell State / Class Example

Use `onStateChange` when you want class-level styling in addition to the built-in data attributes:

```zen
<script lang="ts">
import { zenNavigationShell } from "@zenithbuild/router";

const shellRef = ref<HTMLElement>();
const shellPhase = signal("idle");
const shell = zenNavigationShell(shellRef, {
  onStateChange(state) {
    shellPhase.set(state.phase);
  }
});

zenMount((ctx) => {
  ctx.cleanup(shell.mount());
});
</script>

<div
  ref={shellRef}
  class={
    shellPhase.get() === "swapping"
      ? "min-h-screen rounded-3xl border border-sky-400/50 bg-sky-400/10 transition"
      : "min-h-screen rounded-3xl border border-slate-700 bg-slate-900/70 transition"
  }
>
  <p class="text-sm text-slate-300">Current shell phase: {shellPhase.get()}</p>
</div>
```

## Compose with `zenPresence`

`zenNavigationShell(...)` owns route-level shell phase. `zenPresence(...)` can own an always-mounted overlay or rail inside that shell:

```zen
<script lang="ts">
import { zenNavigationShell } from "@zenithbuild/router";
import { zenPresence } from "@zenithbuild/runtime";

const shellRef = ref<HTMLElement>();
const railRef = ref<HTMLElement>();
const railVisible = signal(false);

const shell = zenNavigationShell(shellRef, {
  onStateChange(state) {
    railVisible.set(state.phase !== "idle");
  }
});
const railPresence = zenPresence(railRef, { timeoutMs: 160 });

zenMount((ctx) => {
  ctx.cleanup(shell.mount());
  ctx.cleanup(railPresence.mount());
});

zeneffect([railVisible], () => {
  railPresence.setPresent(railVisible.get());
});
</script>

<div ref={shellRef}>
  <div ref={railRef} class="h-1 rounded-full bg-sky-400"></div>
</div>
```

For overlay and sheet surfaces, keep the same split: the outer shell may project route-level phase, but the overlay itself should still follow the canonical [Overlay and Sheet Pattern](/docs/reactivity/overlay-sheet-pattern) and remain locally owned.

## Abort / Error Reset Example

`navigation:abort` and `navigation:error` are reset paths only. They do not grant route authority to the shell:

```zen
<script lang="ts">
import { zenNavigationShell } from "@zenithbuild/router";

const shellRef = ref<HTMLElement>();
const shellBusy = signal(false);
const shell = zenNavigationShell(shellRef, {
  onStateChange(state) {
    shellBusy.set(state.phase !== "idle");
  }
});

zenMount((ctx) => {
  ctx.cleanup(shell.mount());
});
</script>

<div ref={shellRef}>
  <p class={shellBusy.get() ? "text-sky-300" : "text-slate-400"}>
    Busy: {shellBusy.get() ? "yes" : "no"}
  </p>
</div>
```

If a navigation is superseded or fails, the phase returns to `idle`, shell attributes are updated, and stale late completions are ignored.

## Cleanup Example

The utility follows the same mount-boundary rule as `zenPresence(...)`:

```zen
<script lang="ts">
import { zenNavigationShell } from "@zenithbuild/router";

const shellRef = ref<HTMLElement>();
const shell = zenNavigationShell(shellRef);

zenMount((ctx) => {
  const stopShell = shell.mount();
  ctx.cleanup(stopShell);
});
</script>

<div ref={shellRef}></div>
```

Cleanup guarantees:
- all router listeners are unsubscribed
- pending transition listeners and timers are cleared
- abort or supersession cannot revive stale shell work later

## Styling Model

`zenNavigationShell(...)` is meant for CSS classes, data-attribute selectors, and narrow presence-style composition.

Typical selector shape:

```css
[data-zen-navigation-phase="leaving"] {
  opacity: 0.82;
}

[data-zen-navigation-phase="swapping"] {
  opacity: 0.65;
}

[data-zen-navigation-phase="entering"] {
  opacity: 1;
}
```

This helper stays deliberately small. It is a route-level visual shell, not a route animation framework.
