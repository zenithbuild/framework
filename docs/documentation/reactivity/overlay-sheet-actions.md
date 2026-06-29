---
title: "Overlay Sheet: Actions"
description: "Confirmation, destructive action, button order, dismissal surface, and supporting copy for the canonical overlay and sheet pattern."
version: "0.1"
status: "canonical"
last_updated: "2026-03-29"
tags: ["reactivity", "overlay", "sheet", "modal", "actions", "confirmation"]
nav:
  order: 17
---

# Overlay Sheet: Actions

Focused page for the [Overlay and Sheet Pattern](./overlay-sheet-pattern.md).

This page covers confirmation surfaces, destructive action wording, button order, the single-dismissal-surface rule, and supporting copy split out of the main pattern. It is a narrow content-pattern follow-through for the existing overlay model, not a dialog framework or design system.

## Destructive Confirmation Wording

When the overlay confirms a destructive action, name the action and the consequence directly:
- prefer `Delete workspace`, `Remove member`, or `Archive project`
- explain the concrete consequence in one short sentence
- avoid vague confirmation text like `Yes`, `Continue`, or `Are you sure?`

Destructive confirmation example:

```zen
<script lang="ts">
const titleId = "delete-workspace-title";
const descriptionId = "delete-workspace-description";
</script>

<div data-overlay-root>
  <aside
    data-overlay-panel
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
  >
    <h2 id={titleId}>Delete workspace</h2>
    <p id={descriptionId}>
      This permanently deletes the workspace and removes access for all members.
    </p>
    <div class="mt-4 flex justify-end gap-3">
      <button>Cancel</button>
      <button>Download export</button>
      <button class="bg-red-600 text-white">Delete workspace</button>
    </div>
  </aside>
</div>
```

Short wording rule:
1. Put the destructive verb in the heading and the destructive action button.
2. Name the thing that will be affected.
3. State the consequence plainly if it is permanent, destructive, or hard to reverse.
4. Use `Cancel` for the safe exit instead of vague confirmation language.

## Button Order for Destructive Surfaces

Canonical order for destructive confirmations:
1. `Cancel`
2. non-destructive secondary action, if one exists
3. destructive action last

Example:

```zen
<div class="mt-4 flex justify-end gap-3">
  <button>Cancel</button>
  <button>Download export</button>
  <button class="bg-red-600 text-white">Delete workspace</button>
</div>
```

Why this order:
- the safe exit appears first
- optional secondary work stays separate from the destructive choice
- the destructive action sits at the end with the strongest emphasis

Visual emphasis should match severity:
- neutral or outline styling for cancel and secondary actions
- strongest emphasis for the destructive action
- do not give destructive actions the same visual weight as neutral actions

This is still a narrow content-pattern follow-through for the existing overlay model, not a dialog framework or design system.

## Non-Destructive Confirmation Surfaces

When the action is reversible or low-risk, keep the surface simpler:
- use `Cancel` + one primary action when no extra choice helps the decision
- keep the supporting copy short and calm
- avoid over-explaining reversible actions

Non-destructive confirmation example:

```zen
<script lang="ts">
const titleId = "archive-workspace-title";
const descriptionId = "archive-workspace-description";
</script>

<div data-overlay-root>
  <aside
    data-overlay-panel
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
  >
    <h2 id={titleId}>Archive workspace</h2>
    <p id={descriptionId}>
      You can restore this workspace later from archived items.
    </p>
    <div class="mt-4 flex justify-end gap-3">
      <button>Cancel</button>
      <button class="bg-sky-600 text-white">Archive workspace</button>
    </div>
  </aside>
</div>
```

Short rule for omitting a secondary action:
1. If the user is choosing only between backing out and continuing, use `Cancel` + one primary action.
2. Add a secondary action only when it supports the same decision and genuinely reduces uncertainty.
3. Do not add extra actions just to fill space.

## Supporting Copy for Reversible Actions

Reversible actions should use shorter, lower-drama copy:
- say what happens
- mention reversibility if it matters
- skip high-stakes warning language when the action is easy to undo

Example:
- good: `You can restore this workspace later from archived items.`
- avoid: `Are you absolutely sure you want to continue? This may have consequences.`

Action count should match decision complexity. Simpler decisions should have fewer actions and shorter copy.

This is still a narrow content-pattern follow-through for the existing overlay model, not a dialog framework or design system.

## Choosing a Single Dismissal Surface

Prefer one dismissal surface when possible.

Header close is sufficient when:
- the surface is lightweight or informational
- there is no footer action group
- the close control is the only explicit dismissal choice you need

Example:

```zen
<aside data-overlay-panel role="dialog" aria-modal="true">
  <div class="flex items-start justify-between">
    <h2>Keyboard shortcuts</h2>
    <button>Close shortcuts</button>
  </div>
</aside>
```

Footer `Cancel` is sufficient when:
- the surface already has primary or destructive footer actions
- the user is making a confirm-or-cancel decision
- adding a second dismissal control in the header would repeat the same choice

Example:

```zen
<div class="mt-4 flex justify-end gap-3">
  <button>Cancel</button>
  <button class="bg-sky-600 text-white">Archive workspace</button>
</div>
```

Including both is justified only when the surface is long, dense, or layout-constrained enough that a header close materially improves escape without duplicating the primary footer decision.

Long-form sheet example:

```zen
<aside data-overlay-panel role="dialog" aria-modal="true">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2>Workspace settings</h2>
      <p>Review notifications, members, and publishing defaults.</p>
    </div>
    <button aria-label="Close workspace settings">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>

  <form class="mt-6 space-y-6">
    <!-- long-form settings content -->
  </form>

  <div class="mt-6 flex justify-end gap-3">
    <button>Cancel</button>
    <button class="bg-sky-600 text-white">Save changes</button>
  </div>
</aside>
```

For long-form sheets, use the header close for navigation convenience and keep footer `Cancel` as the main decision control. The header affordance helps users leave a long surface quickly; the footer row should still own the form decision.

Short rule:
1. If there is no footer action row, a header close is usually enough.
2. If there is already a footer action row, prefer footer `Cancel` as the single explicit dismissal control.
3. Add both only when the surface is long or dense enough that the header close helps navigation while footer `Cancel` remains the actual decision row.

Anti-pattern:
- a header close button plus a footer `Cancel` on a short, simple confirm surface usually adds clutter instead of clarity

This remains a narrow content-pattern follow-through for the existing overlay model, not a dialog framework or design system.
