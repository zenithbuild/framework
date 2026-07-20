---
title: "Overlay Sheet: Accessibility"
description: "Accessible name, description, ARIA wiring, stable ids, and close labeling for the canonical overlay and sheet pattern."
version: "0.1"
status: "canonical"
last_updated: "2026-03-29"
tags: ["reactivity", "overlay", "sheet", "modal", "accessibility", "aria"]
nav:
  order: 16
section: "Styling and UI"
sectionOrder: 5
order: 5
---

# Overlay Sheet: Accessibility

Focused page for the [Overlay and Sheet Pattern](./overlay-sheet-pattern.md).

This page covers the narrow accessibility follow-through split out of the main pattern: accessible name, description, ARIA wiring, stable ids, and close labeling. It keeps naming local to the surface and does not introduce a full dialog framework.

## Accessible Name and Description

Keep naming and description local to the surface itself:
- use `aria-labelledby` when the panel already has a visible heading
- use `aria-label` only when there is no visible heading inside the surface
- use `aria-describedby` when one short block of text explains the surface purpose or the next expected action
- omit `aria-describedby` when there is no meaningful supporting description
- keep those ids stable and inside the panel instead of pointing at unrelated page content

Short decision rule:
1. If the surface has a visible heading, use `aria-labelledby`.
2. If it does not have a visible heading, use `aria-label`.
3. If one short supporting sentence helps the user act, use `aria-describedby`.
4. If there is no meaningful supporting sentence, omit `aria-describedby`.

Canonical pattern:

```zen
<script lang="ts">
const titleId = "settings-sheet-title";
const descriptionId = "settings-sheet-description";
</script>

<div data-overlay-root>
  <aside
    data-overlay-panel
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
  >
    <h2 id={titleId}>Account settings</h2>
    <p id={descriptionId}>
      Review notification preferences before saving changes.
    </p>
    <button>Save</button>
  </aside>
</div>
```

Use `aria-labelledby` by default when a visible title already exists. It keeps the accessible name aligned with the text the user can see.

Use `aria-describedby` when a short supporting sentence helps explain the dialog before the user acts. If there is no meaningful supporting copy, omit `aria-describedby` rather than pointing at large or unstable content.

## `aria-label` Fallback Example

Use `aria-label` only when there is no visible heading inside the surface:

```zen
<div data-overlay-root>
  <aside
    data-overlay-panel
    role="dialog"
    aria-modal="true"
    aria-label="Quick actions"
  >
    <div class="flex items-center justify-between">
      <button>Archive</button>
      <button>Delete</button>
    </div>
  </aside>
</div>
```

This is a fallback, not the default. If the surface already renders a visible title, prefer `aria-labelledby` so the accessible name stays aligned with what the user sees.

## Omit `aria-describedby` Example

If there is no meaningful supporting description, omit `aria-describedby` entirely:

```zen
<script lang="ts">
const titleId = "quick-confirm-title";
</script>

<div data-overlay-root>
  <aside
    data-overlay-panel
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
  >
    <h2 id={titleId}>Delete file</h2>
    <div class="mt-4 flex gap-3">
      <button>Cancel</button>
      <button>Delete</button>
    </div>
  </aside>
</div>
```

Do not wire `aria-describedby` to:
- empty text
- repeated heading text
- long unrelated body content
- generic instructional filler that does not help the user decide what to do next

Redundant or empty descriptions create noise without adding useful context.

## Stable Id Guidance

Keep ids predictable and local:
- define one stable title id and one stable description id for the surface
- place those id-bearing nodes inside the panel
- keep the heading and description mounted with the surface

Do not:
- point `aria-labelledby` at a heading elsewhere on the page
- point `aria-describedby` at long unrelated content outside the surface
- use `aria-label` when a visible in-surface heading already exists
- keep an empty or redundant `aria-describedby` just because the attribute was easy to add
- treat this as a generalized id-management system

This is still a narrow overlay accessibility follow-through, not a full dialog framework.

## Close Button Labeling

Close controls should use explicit, local, human-readable labeling.

Default rule:
- if the close control has visible text like `Close preferences` or `Cancel`, that visible text is the accessible label
- if the close control is icon-only, add a local `aria-label` that names the close action clearly

Visible-text close control example:

```zen
<aside data-overlay-panel role="dialog" aria-modal="true">
  <div class="flex items-start justify-between">
    <h2>Notification preferences</h2>
    <button>Close preferences</button>
  </div>
</aside>
```

Icon-only close control example:

```zen
<aside data-overlay-panel role="dialog" aria-modal="true">
  <div class="flex items-start justify-between">
    <h2>Notification preferences</h2>
    <button aria-label="Close preferences">X</button>
  </div>
</aside>
```

Use `aria-label` only when the control itself does not already expose clear visible text.

## Action-Language Consistency

Keep action wording consistent across the overlay:
- opener names the surface: `Open preferences`
- close or dismiss actions use one clear family of terms: `Close preferences` or `Cancel`
- primary actions name the result: `Save preferences`
- avoid generic labels like `Do it`, `Go`, `Done`, or `Force close`

Short decision rule:
1. Name the thing being opened in the opener label.
2. Use explicit close or cancel wording for dismissive actions.
3. Name the outcome for the primary action.
4. Keep the same noun across the whole surface.

Why this matters:
- users can predict what each control will do
- visible text and accessible names stay aligned
- the overlay reads like one coherent interaction instead of unrelated button labels

This remains a narrow overlay accessibility and content follow-through, not a full dialog framework.
