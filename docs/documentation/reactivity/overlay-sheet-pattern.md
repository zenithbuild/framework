---
title: "Overlay and Sheet Pattern"
description: "Canonical always-mounted overlay and sheet composition built from ref, zenMount, zenPresence, and deterministic cleanup."
version: "0.1"
status: "canonical"
last_updated: "2026-03-29"
tags: ["reactivity", "overlay", "sheet", "modal", "presence"]
nav:
  order: 14
section: "Styling and UI"
sectionOrder: 5
order: 4
---

# Overlay and Sheet Pattern

## Contract Boundary

This guide defines one canonical overlay and sheet pattern built entirely from existing Zenith primitives:
- `ref`
- `zenMount(...)`
- `zenPresence(...)`
- deterministic cleanup

It is intentionally narrow:
- one always-mounted overlay root
- one always-mounted surface or panel
- ref-owned nodes only
- no hidden DOM ownership
- no fragment retention
- no new runtime or router primitive

`zenNavigationShell(...)` may style an outer shell around this pattern, but it is optional and stays outside overlay ownership.

## Why This Pattern Is Always-Mounted

`zenPresence(...)` owns phase truth on a node that already belongs to the component. It does not retain conditional fragments or delay unmount.

That means the reliable overlay shape is:
- keep the overlay root mounted
- keep the panel mounted
- drive visibility through `data-zen-presence`
- attach backdrop and Escape behavior inside `zenMount(...)`

This keeps overlays inside Zenith's existing deterministic runtime model instead of inventing an overlay framework.

## Focus Follow-Through Boundary

This pattern can also handle one narrow accessibility follow-through without new primitives:
- move focus into the surface when it finishes opening
- return focus to the opener when it finishes closing
- give the dialog a stable accessible name and description

Use only:
- one opener ref
- one initial-focus ref
- `zenPresence(..., { onPhaseChange })`
- `zenMount(...)`

Do not turn this into a focus trap, overlay stack, dialog manager, or generalized accessibility framework.

## Canonical Demo

:::demo id="modal-basic"
:::

## Minimal Example

```zen
<script lang="ts">
import { zenPresence } from "@zenithbuild/runtime";

const open = signal(false);
const overlayRef = ref<HTMLElement>();
const panelRef = ref<HTMLElement>();
const overlayPresence = zenPresence(overlayRef, { timeoutMs: 220 });

function openSheet() {
  open.set(true);
}

function closeSheet() {
  open.set(false);
}

zenMount((ctx) => {
  ctx.cleanup(overlayPresence.mount());
});

zeneffect([open], () => {
  overlayPresence.setPresent(open.get());
});
</script>

<button on:click={openSheet}>Open sheet</button>
<div ref={overlayRef} data-overlay-root>
  <aside ref={panelRef} data-overlay-panel>
    Overlay content
    <button on:click={closeSheet}>Close</button>
  </aside>
</div>
```

Use one presence controller on the overlay root. Style the panel from the same overlay phase rather than creating a second visibility system.

## Focused Pages

The detailed guidance from this pattern is split into focused pages so each stays small and maintainable. This page remains the overview, mental model, canonical demo, and minimal example.

- [Focus and Dismissal](./overlay-sheet-focus-dismissal.md) — focus follow-through, backdrop dismissal, and Escape handling
- [Accessibility](./overlay-sheet-accessibility.md) — accessible name, description, ARIA wiring, stable ids, and close labeling
- [Actions](./overlay-sheet-actions.md) — confirmation, destructive action wording, button order, dismissal surface, and supporting copy
- [Settings](./overlay-sheet-settings.md) — dense long-form sheets, section ordering, progressive disclosure, and save/cancel semantics
- [Styling and Cleanup](./overlay-sheet-styling-cleanup.md) — phase styling, deterministic cleanup, optional `zenNavigationShell(...)` composition, and non-goals

The section stubs below preserve the original anchor names and link to the focused page that now holds each section.

## Initial Focus Example

Moved to [Focus and Dismissal](./overlay-sheet-focus-dismissal.md#initial-focus-example).

## Backdrop Click Example

Moved to [Focus and Dismissal](./overlay-sheet-focus-dismissal.md#backdrop-click-example).

## Escape Example

Moved to [Focus and Dismissal](./overlay-sheet-focus-dismissal.md#escape-example).

## Focus Return Example

Moved to [Focus and Dismissal](./overlay-sheet-focus-dismissal.md#focus-return-example).

## Accessible Name and Description

Moved to [Accessibility](./overlay-sheet-accessibility.md#accessible-name-and-description).

## `aria-label` Fallback Example

Moved to [Accessibility](./overlay-sheet-accessibility.md#aria-label-fallback-example).

## Omit `aria-describedby` Example

Moved to [Accessibility](./overlay-sheet-accessibility.md#omit-aria-describedby-example).

## Stable Id Guidance

Moved to [Accessibility](./overlay-sheet-accessibility.md#stable-id-guidance).

## Close Button Labeling

Moved to [Accessibility](./overlay-sheet-accessibility.md#close-button-labeling).

## Action-Language Consistency

Moved to [Accessibility](./overlay-sheet-accessibility.md#action-language-consistency).

## Destructive Confirmation Wording

Moved to [Actions](./overlay-sheet-actions.md#destructive-confirmation-wording).

## Button Order for Destructive Surfaces

Moved to [Actions](./overlay-sheet-actions.md#button-order-for-destructive-surfaces).

## Non-Destructive Confirmation Surfaces

Moved to [Actions](./overlay-sheet-actions.md#non-destructive-confirmation-surfaces).

## Supporting Copy for Reversible Actions

Moved to [Actions](./overlay-sheet-actions.md#supporting-copy-for-reversible-actions).

## Choosing a Single Dismissal Surface

Moved to [Actions](./overlay-sheet-actions.md#choosing-a-single-dismissal-surface).

## Structuring Dense Long-Form Sheets

Moved to [Settings](./overlay-sheet-settings.md#structuring-dense-long-form-sheets).

## Ordering Sections in Settings Sheets

Moved to [Settings](./overlay-sheet-settings.md#ordering-sections-in-settings-sheets).

## Progressive Disclosure in Settings Sheets

Moved to [Settings](./overlay-sheet-settings.md#progressive-disclosure-in-settings-sheets).

## Summary and Save Semantics in Settings Sheets

Moved to [Settings](./overlay-sheet-settings.md#summary-and-save-semantics-in-settings-sheets).

## Reversible vs Irreversible Settings Saves

Moved to [Settings](./overlay-sheet-settings.md#reversible-vs-irreversible-settings-saves).

## Cancel Semantics in Settings Sheets

Moved to [Settings](./overlay-sheet-settings.md#cancel-semantics-in-settings-sheets).

## Overlay and Panel Phase Styling

Moved to [Styling and Cleanup](./overlay-sheet-styling-cleanup.md#overlay-and-panel-phase-styling).

## Cleanup Example

Moved to [Styling and Cleanup](./overlay-sheet-styling-cleanup.md#cleanup-example).

## Optional Composition with `zenNavigationShell(...)`

Moved to [Styling and Cleanup](./overlay-sheet-styling-cleanup.md#optional-composition-with-zennavigationshell).

## What This Pattern Does Not Try to Solve

Moved to [Styling and Cleanup](./overlay-sheet-styling-cleanup.md#what-this-pattern-does-not-try-to-solve).
