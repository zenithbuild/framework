---
title: "Primitives and Patterns"
description: "Reference for refs, local state patterns, and deterministic animation wiring guidance."
version: "0.3"
status: "canonical"
last_updated: "2026-02-27"
tags: ["reference", "primitives", "patterns", "animations"]
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

## See Also

- [Reactive Binding Model](/docs/reference/reactive-binding-model)
- [Controlled vs Uncontrolled Components](/docs/reactivity/controlled-uncontrolled-components)
