---
title: "Overlay and Sheet Pattern"
description: "Canonical always-mounted overlay and sheet composition built from ref, zenMount, zenPresence, and deterministic cleanup."
version: "0.1"
status: "canonical"
last_updated: "2026-03-29"
tags: ["reactivity", "overlay", "sheet", "modal", "presence"]
nav:
  order: 14
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

## Structuring Dense Long-Form Sheets

As a sheet gets denser, keep the header brief and orienting only. Put the real detail in section headings and body copy instead of a long introductory paragraph that pushes the actual controls down.

Dense long-form sheet example:

```zen
<aside data-overlay-panel role="dialog" aria-modal="true">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2>Workspace settings</h2>
      <p>Review settings and save when you are ready.</p>
    </div>
    <button aria-label="Close workspace settings">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>

  <form class="mt-6 space-y-8">
    <section>
      <h3>Notifications</h3>
      <p>Choose which activity should trigger email updates.</p>
      <!-- notification fields -->
    </section>

    <section>
      <h3>Members</h3>
      <p>Control who can invite collaborators and publish changes.</p>
      <!-- member fields -->
    </section>

    <section>
      <h3>Publishing defaults</h3>
      <p>Set visibility, review flow, and default publish behavior.</p>
      <!-- publish fields -->
    </section>
  </form>

  <div class="mt-6 flex justify-end gap-3">
    <button>Cancel</button>
    <button class="bg-sky-600 text-white">Save changes</button>
  </div>
</aside>
```

Short rule for dense sheets:
1. Keep the header summary short enough to orient the user in one glance.
2. Put detail in section headings and section-level body copy where the user makes decisions.
3. Keep the footer stable and action-focused even as the body grows longer.

For dense sheets, the header tells the user where they are, the body explains the settings in place, and the footer keeps the final decision row predictable. Do not let a long intro paragraph push the real content and actions too far down the sheet.

Anti-pattern:
- a long introductory block that repeats every section detail before the real form starts usually adds scroll and hides the actual decisions

This remains a narrow content-pattern follow-through for the existing overlay model, not a dialog framework or design system.

## Ordering Sections in Settings Sheets

Group fields under one section heading when they answer the same user question or contribute to the same decision. Split sections when the user would otherwise need to scan past unrelated controls to find the next meaningful choice.

Settings-sheet section-ordering example:

```zen
<aside data-overlay-panel role="dialog" aria-modal="true">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2>Workspace settings</h2>
      <p>Review the main settings, then save changes at the end.</p>
    </div>
    <button aria-label="Close workspace settings">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>

  <form class="mt-6 space-y-8">
    <section>
      <h3>General</h3>
      <p>Name the workspace and choose the default visibility.</p>
      <!-- general fields -->
    </section>

    <section>
      <h3>Notifications</h3>
      <p>Decide which updates should trigger email or in-app alerts.</p>
      <!-- notification fields -->
    </section>

    <section>
      <h3>Advanced</h3>
      <p>Adjust publish defaults and member permissions only if needed.</p>
      <!-- advanced fields -->
    </section>
  </form>

  <div class="mt-6 flex justify-end gap-3">
    <button>Cancel</button>
    <button class="bg-sky-600 text-white">Save changes</button>
  </div>
</aside>
```

Short rule for grouping and sequencing:
1. Group related fields under one heading when they belong to the same decision.
2. Split sections once scanning cost grows and the next group answers a different question.
3. Order sections from broad, high-confidence choices toward detailed or advanced settings so the footer feels like the natural end of the flow.

For settings sheets, section order should help the user progress toward the footer instead of forcing them to re-parse the whole sheet. Start with the settings most users expect to change, then move toward less common or more detailed controls.

Anti-pattern:
- splitting every two fields into a new section creates noise, but dumping every setting into one undifferentiated block makes the footer feel disconnected from the choices above it

This remains a narrow content-pattern follow-through for the existing overlay model, not a dialog framework or design system.

## Progressive Disclosure in Settings Sheets

Keep advanced settings visible in their own final section when they meaningfully change behavior, affect fewer users, or would distract from the main choices if mixed into the earlier sections. If a detail only clarifies one control, use a short explanatory sentence next to that control instead of creating another subsection.

Settings-sheet progressive disclosure example:

```zen
<aside data-overlay-panel role="dialog" aria-modal="true">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2>Workspace settings</h2>
      <p>Review the main settings first, then adjust advanced options if needed.</p>
    </div>
    <button aria-label="Close workspace settings">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>

  <form class="mt-6 space-y-8">
    <section>
      <h3>General</h3>
      <p>Name the workspace and choose its default visibility.</p>
      <!-- general fields -->
    </section>

    <section>
      <h3>Notifications</h3>
      <p>Choose which updates should trigger alerts.</p>
      <!-- notification fields -->
    </section>

    <section>
      <h3>Advanced</h3>
      <p>Change publish defaults and permission behavior only if your team needs custom rules.</p>
      <!-- advanced fields -->
    </section>
  </form>

  <div class="mt-6 flex justify-end gap-3">
    <button>Cancel</button>
    <button class="bg-sky-600 text-white">Save changes</button>
  </div>
</aside>
```

Short rule for progressive disclosure:
1. Put core settings first.
2. Keep advanced settings last when they are optional, less common, or more detailed.
3. Keep the footer action row unchanged even when the advanced section is present.

If one control only needs a brief clarification, a short sentence below that control is usually enough. Do not create another subsection unless the user is actually entering a new cluster of settings.

Anti-pattern:
- scattering advanced toggles through every section makes the sheet harder to scan and weakens the sense that the footer is the final decision point

This remains a narrow content-pattern follow-through for the existing overlay model, not a dialog framework or design system.

## Summary and Save Semantics in Settings Sheets

Most settings sheets do not need an extra summary block near the footer. If the body sections already explain the decisions clearly, let the user move straight from the final section into the action row.

Add a short pre-footer summary only when the sheet is long, dense, or broad enough that the user could lose sight of what the final save action covers. Keep that summary brief and action-oriented. It should re-anchor the scope of the save action, not repeat every section above it.

Settings-sheet summary example:

```zen
<aside data-overlay-panel role="dialog" aria-modal="true">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2>Workspace settings</h2>
      <p>Review the main settings first, then save when you are ready.</p>
    </div>
    <button aria-label="Close workspace settings">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>

  <form class="mt-6 space-y-8">
    <section>
      <h3>General</h3>
      <p>Name the workspace and choose its default visibility.</p>
      <!-- general fields -->
    </section>

    <section>
      <h3>Notifications</h3>
      <p>Choose which updates should trigger alerts.</p>
      <!-- notification fields -->
    </section>

    <section>
      <h3>Advanced</h3>
      <p>Change publish defaults and permission behavior only if your team needs custom rules.</p>
      <!-- advanced fields -->
    </section>
  </form>

  <div class="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
    <p class="text-sm text-zinc-700">
      Save changes to apply your updated workspace visibility, notification, and publish settings.
    </p>
  </div>

  <div class="mt-4 flex justify-end gap-3">
    <button>Cancel</button>
    <button class="bg-sky-600 text-white">Save workspace settings</button>
  </div>
</aside>
```

Short rule for summaries and save copy:
1. If the section body already explains the decision clearly, omit the summary.
2. Use a short pre-footer summary only when the action scope is easy to lose in a long or dense sheet.
3. Keep the footer action row brief and decision-focused with button copy that names the surface or change scope without becoming a sentence.

Use `Save changes` only when the surrounding context already makes the scope obvious. If the sheet covers a specific surface or resource, prefer button copy such as `Save workspace settings` or `Save notification settings`. The button should stay specific and brief; the explanation belongs in the body or, at most, the short pre-footer summary.

Anti-pattern:
- turning the footer area into a second explanation block makes the final action harder to scan and repeats content the user already passed through in the body

This remains a narrow content-pattern follow-through for the existing overlay model, not a dialog framework or design system.

## Reversible vs Irreversible Settings Saves

Use neutral save wording when the user is making ordinary reversible changes. If the settings can be adjusted again without unusual cost, `Save changes` is usually enough.

Use stronger footer language when the change takes effect immediately, affects other people right away, or is hard to undo. In those cases, the body copy, optional summary, and footer action should all describe the same consequence level instead of mixing mild copy with a high-impact action.

Reversible-save example:

```zen
<aside data-overlay-panel role="dialog" aria-modal="true">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2>Notification settings</h2>
      <p>Choose which updates should trigger email alerts.</p>
    </div>
    <button aria-label="Close notification settings">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>

  <form class="mt-6 space-y-6">
    <!-- notification fields -->
  </form>

  <div class="mt-6 flex justify-end gap-3">
    <button>Cancel</button>
    <button class="bg-sky-600 text-white">Save changes</button>
  </div>
</aside>
```

Immediate-effect or hard-to-undo example:

```zen
<aside data-overlay-panel role="dialog" aria-modal="true">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2>Publishing settings</h2>
      <p>Changing visibility to public will make this workspace accessible outside your team immediately.</p>
    </div>
    <button aria-label="Close publishing settings">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>

  <form class="mt-6 space-y-6">
    <!-- publishing fields -->
  </form>

  <div class="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <p class="text-sm text-amber-900">
      Applying this change will publish the workspace publicly right away.
    </p>
  </div>

  <div class="mt-4 flex justify-end gap-3">
    <button>Cancel</button>
    <button class="bg-amber-600 text-white">Publish workspace publicly</button>
  </div>
</aside>
```

Short rule for consequence-aligned save wording:
1. Use neutral save wording for ordinary reversible settings.
2. Use stronger action labels when the change is immediate, visible to others, or hard to undo.
3. Keep the body, optional summary, and footer button aligned on the same consequence level.

Avoid low-consequence wording on high-consequence actions, and avoid dramatic warnings on ordinary reversible saves. The user should not read a mild body explanation and then hit a severe action label, or read alarming copy only to end at a generic `Save changes` button.

Anti-pattern:
- mild body copy with a severe footer label, or severe body copy with a neutral footer label, makes the sheet feel internally inconsistent and weakens the final decision point

This remains a narrow content-pattern follow-through for the existing overlay model, not a dialog framework or design system.

## Cancel Semantics in Settings Sheets

For settings sheets, `Cancel` should usually mean "close without applying the edits made inside this sheet." It should not imply that already-saved settings, external state, or changes made somewhere else will be rolled back unless the surface truly performs that broader undo.

Settings-sheet cancel-semantics example:

```zen
<aside data-overlay-panel role="dialog" aria-modal="true">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2>Workspace settings</h2>
      <p>Update these settings and save when you are ready.</p>
    </div>
    <button aria-label="Close workspace settings">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>

  <form class="mt-6 space-y-8">
    <!-- settings fields -->
  </form>

  <div class="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
    <p class="text-sm text-zinc-700">
      Cancel closes this sheet without applying the edits you made here.
    </p>
  </div>

  <div class="mt-4 flex justify-end gap-3">
    <button>Cancel</button>
    <button class="bg-sky-600 text-white">Save workspace settings</button>
  </div>
</aside>
```

Short rule for cancel semantics:
1. Use `Cancel` to mean "close without applying unsaved in-sheet edits."
2. Keep supporting copy local to the sheet's actual discard boundary.
3. Do not imply broader rollback unless the UI really restores previously saved or external state.

If the sheet only controls unsaved edits made inside the current surface, say that directly. Avoid phrases like `Revert changes` or `Undo all changes` unless the sheet truly performs that larger rollback.

Anti-pattern:
- copy that says `Cancel will restore previous settings` when the action really only closes the sheet without applying current edits misleads the user about what will be undone

This remains a narrow content-pattern follow-through for the existing overlay model, not a dialog framework or design system.

Short rule:
1. If there is no footer action row, a header close is usually enough.
2. If there is already a footer action row, prefer footer `Cancel` as the single explicit dismissal control.
3. Add both only when the surface is long or dense enough that the header close helps navigation while footer `Cancel` remains the actual decision row.

Anti-pattern:
- a header close button plus a footer `Cancel` on a short, simple confirm surface usually adds clutter instead of clarity

This remains a narrow content-pattern follow-through for the existing overlay model, not a dialog framework or design system.

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
