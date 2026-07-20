---
title: "Component Server Values"
description: "Owner-local server values for Zenith layouts and components."
version: "0.1"
status: "canonical"
last_updated: "2026-06-01"
tags: ["components", "server", "data", "hydration"]
nav:
  order: 20
section: "Server and Data"
sectionOrder: 4
order: 4
---

# Component Server Values

Pages anchor emitted documents. Routes control requests. Components compose structure and may own local server values.

Component Server Values let ordinary `.zen` layouts and components declare server-only values where those values are used. Internally, this is implemented as Scoped Server Data: owner-local values are resolved during the page's server render, serialized into scoped hydration slices, and consumed during hydration without client refetch.

This is not React Server Components. Zenith does not split components into separate server/client component classes, and component server values do not create component route handlers.

## Owner Model

Page routes still own emitted HTML and request policy:

- `guard(ctx)` decides route authorization.
- `action(ctx)` owns route form mutations.
- `load(ctx)` owns page-route data.

Layouts and components may own local server values only when reached through a page render. A page render resolves to one emitted document root. Document-mode layouts can supply `<html>`, `<head>`, and `<body>` structure, but the page route still anchors the emitted document.

## Level 1: Server Variables

Use Level 1 when the owner only needs local server values:

```zen
<script server lang="ts">
const navigation = await getNavigation()
</script>

<nav>{navigation.title}</nav>
```

Level 1 serializes only variables referenced by the owner template. Intermediates stay server-only.

## Level 2: Explicit Data

Use Level 2 when the owner needs `ctx` or static literal props:

```zen
<script server lang="ts">
export const data = async (ctx, props) => ({
  stats: await getRepoStats(ctx, props.repoId)
})
</script>

<article>{data.stats.stars}</article>
```

This is scoped `data(ctx, props)`. It is not `load(ctx)` and should not be described as a component loader.

## Props Boundary

Scoped component data supports static literal props:

```text
<RepoStats repoId="zenith" featured count={3} />
```

Unsupported prop shapes fail at build time because they require runtime evaluation:

```text
<RepoStats repoId={data.repoId} />
<RepoStats {...props} />
<RepoStats onSelect={selectRepo} />
```

Repeated component instances use deterministic runtime keys conceptually shaped like:

```text
component:src/components/RepoStats.zen:o0
component:src/components/RepoStats.zen:o1
```

Singleton components use `component:{ownerKey}`. Layouts use `layout:{ownerKey}`.

## SSR And Hydration

On a successful page request, Zenith runs route stages first, then scoped owners:

```text
route guard/action/load as applicable -> component server values -> SSR payload
```

Redirects or denies from route stages short-circuit before scoped owner execution. Scoped owner errors are fatal for that render; Zenith does not emit partial scoped payloads.

Hydration consumes the serialized route payload and scoped owner slices. It does not import scoped server modules, run owner server code in the browser, refetch values on mount, or refresh values on signal updates, effects, DOM updates, or remounts.

## Generated Types

Builds emit `.zenith/zenith-scoped-server-data.d.ts` alongside the existing Zenith declaration files.

```ts
type LayoutData =
  Zenith.ScopedServerDataFor<"src/layouts/DefaultLayout.zen">

type FirstCardData =
  Zenith.ScopedServerRuntimeDataFor<"component:src/components/RepoStats.zen:o0">
```

Type inference is conservative. Literal-safe values and simple local annotations are represented. Unsafe or imported shapes fall back to `unknown` or `Record<string, unknown>`.

## Migration Guidance

Move data into Component Server Values when it is local to a layout or component:

```text
Before: page load(ctx) fetches navigation, then the page passes it through props.
After: DefaultLayout.zen declares navigation in <script server lang="ts"> and reads it locally.
```

Keep request policy in page routes:

- auth and redirects stay in `guard(ctx)`
- mutations stay in `action(ctx)`
- route-wide view models stay in `load(ctx)`
- component/layout `guard`, `load`, `action`, `redirect`, and `deny` are not supported

## Non-Goals In V1

Component Server Values v1 does not support:

- page-level server variables
- component or layout `load(ctx)`
- component or layout route control such as `redirect(...)` or `deny(...)`
- dynamic component prop expressions for scoped data
- cache or revalidation APIs
- client-side scoped refetch
- build-time scoped prerender
- React Server Components-style server/client component classes
