---
title: "Overlay Sheet: Settings"
description: "Dense long-form sheets, settings section ordering, progressive disclosure, save/cancel semantics, and reversible vs irreversible settings for the canonical overlay and sheet pattern."
version: "0.1"
status: "canonical"
last_updated: "2026-03-29"
tags: ["reactivity", "overlay", "sheet", "modal", "settings", "forms"]
nav:
  order: 18
---

# Overlay Sheet: Settings

Focused page for the [Overlay and Sheet Pattern](./overlay-sheet-pattern.md).

This page covers dense long-form sheets, settings section ordering, progressive disclosure, save and cancel semantics, and reversible vs irreversible settings saves split out of the main pattern. It is a narrow content-pattern follow-through for the existing overlay model, not a dialog framework or design system.

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
