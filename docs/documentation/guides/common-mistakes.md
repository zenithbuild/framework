---
title: "Common Mistakes"
description: "Frequent Zenith authoring errors and the canonical fixes."
version: "0.3"
status: "canonical"
last_updated: "2026-02-27"
tags: ["guides", "troubleshooting", "contracts"]
nav:
  order: 40
---

# Common Mistakes

## 1. Foreign Framework Syntax in `.zen`

Problem:

Zenith rejects copied template syntax from other frameworks.

```text
- @if
- @click
- onClick
```

Fix:
- Use plain Zenith expressions for conditional UI.
- Use canonical DOM event bindings as `on:<event>={handler}`.

```zen
<script lang="ts">
state open = false
function save() {}
</script>

<p>{open ? "Open" : "Closed"}</p>
<button on:click={save}>Save</button>
```

## 2. Unbound Identifiers in Markup

Problem:

```text
<h1>{headingText}</h1>
```

If `headingText` is not declared in scope, compile-time diagnostics should fail.

Fix:
- Declare the identifier locally.
- Or reference an explicit source such as `props.headingText`.

## 3. Direct-Call Event Handlers

Problem:
- Calling a handler during render instead of passing a function value.
- Zenith rejects direct-call handler expressions at compile time.

Fix:

```zen
<script lang="ts">
function save() {}
</script>

<div>
  <button on:click={save}>Save</button>
  <button on:click={() => save()}>Save</button>
</div>
```

## 4. Legacy Hover Event Names

Problem:

Using legacy mouse hover bindings for logic causes drift from canonical docs.

Fix:
- Use `on:hoverin` / `on:hoverout` (aliases for pointer events).
- Or use `on:pointerenter` / `on:pointerleave` directly.

## 5. Component Event Forwarding Assumptions

Problem:

Binding events on a component tag does not automatically forward DOM events unless the component contract forwards them.

Fix:
- Bind events on DOM elements inside the component.
- Expose explicit callback props for parent-driven behavior.

## 6. Controlled vs Uncontrolled Mixing

Problem:

Passing `open` without proper `onOpenChange` handling can create confusing ownership.

Fix:
- Use full controlled triplet (`open` + `onOpenChange`).
- Or use uncontrolled (`defaultOpen`) without external source-of-truth props.

## 7. Treating Component Server Values Like Route Load

Problem:

Component and layout owners cannot export route APIs.

```text
<script server lang="ts">
export const load = async (ctx) => ({ navigation: await getNavigation() })
</script>
```

Fix:
- Use a top-level server constant for local owner values.
- Or use scoped `data(ctx, props)` for owner-local values that need `ctx` or static literal props.
- Keep route authorization, redirects, denies, and mutations in page `guard(ctx)`, `load(ctx)`, and `action(ctx)`.

## 8. Dynamic Props For Scoped Component Data

Problem:

Scoped component server data does not evaluate dynamic component props.

```text
<RepoStats repoId={data.repoId} />
<RepoStats {...props} />
```

Fix:
- Use static literal props when the component owns scoped server data.
- Keep dynamic route-owned values in the page route payload until a later contract supports more.

## See Also

- [Events](/docs/syntax/events)
- [Bindings and Expressions](/docs/syntax/bindings-expressions)
- [Controlled vs Uncontrolled Components](/docs/reactivity/controlled-uncontrolled-components)
- [Component Server Values](/docs/components/component-server-values)
