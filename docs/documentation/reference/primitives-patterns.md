---
title: "Primitives and Patterns"
description: "Reference for refs, local state patterns, and deterministic animation wiring guidance."
version: "0.4"
status: "canonical"
last_updated: "2026-03-29"
tags: ["reference", "primitives", "patterns", "animations"]
section: "Core Concepts"
sectionOrder: 2
order: 5
---

# Primitives and Patterns

## Contract: Refs

Contract: use refs for component-owned DOM integration points.

Invariant: DOM access remains explicit and deterministic.

Definition of Done:
- Nodes needed for behaviors/animations are captured by refs.
- Cleanup removes listeners and kills external animation timelines.

## Contract: State Ownership

Contract: local state is acceptable for self-contained behavior; parent control is opt-in through controlled props.

Invariant: controlled props override local defaults.

Definition of Done:
- Components expose controlled/uncontrolled prop triplets where relevant.
- Parent override paths do not require hidden global channels.

## Contract: Animation Wiring

Contract: GSAP or other animation engines are allowed in component scripts when behavior is deterministic and cleaned up.

Invariant: mount/unmount lifecycles clean all listeners/timelines.

Definition of Done:
- Setup happens in zenMount boundary.
- Teardown removes listeners and kills timeline instances.
- Use `zenOn(target, eventName, handler, options?)` for event subscriptions; do not call `addEventListener` directly.

## Contract: Presence Helper

Contract: `zenPresence(...)` is the canonical narrow helper for ref-owned, always-mounted node presence.

Invariant: it does not retain fragments, delay conditional unmount, or widen Zenith into an animation framework.

Rules:
- `zenPresence` is an explicit runtime import, not a compiler-owned built-in.
- `presence(...)` may exist as an optional convenience alias, but `zenPresence(...)` stays primary.
- Create the controller once per ref-owned node.
- Call `presence.mount()` inside `zenMount(...)`.
- Drive `presence.setPresent(next)` from reactive state.
- Style phases through `data-zen-presence="hidden|entering|present|exiting"`.

Definition of Done:
- Entry starts only after the mount boundary.
- `transitionend` / `animationend` or timeout fallback settles the phase.
- Cleanup clears owned listeners/timers with no ghost work.
- Hidden state is still DOM-owned by the component; this helper does not delay node removal outside always-mounted markup.

## Contract: Overlay / Sheet Composition

Contract: always-mounted overlays and sheets compose existing primitives only.

Invariant: one ref-owned overlay root and one ref-owned panel are enough for the first canonical pattern.

Rules:
- `zenPresence(...)` is the only visibility primitive.
- `zenMount(...)` owns backdrop and Escape listeners.
- `zenOn(...)` handles subscriptions; no `addEventListener(...)`.
- `zenNavigationShell(...)` may style an outer shell, but does not own overlay truth.
- No hidden DOM ownership, no portal system, and no generalized overlay manager.

Definition of Done:
- Overlay root and panel are explicit refs.
- Backdrop click and Escape close deterministically.
- Cleanup removes all owned listeners and timers.
- The pattern remains always-mounted and does not depend on fragment retention.

## See Also

- [Reactive Binding Model](/docs/reference/reactive-binding-model)
- [zenEffect vs zenMount](/docs/reactivity/effects-vs-mount)
- [Controlled vs Uncontrolled Components](/docs/reactivity/controlled-uncontrolled-components)
- [Overlay and Sheet Pattern](/docs/reactivity/overlay-sheet-pattern)
