---
title: "Quickstart"
description: "Install, create, run, and extend a Zenith app with a reactive component, a route, and a server load(ctx)."
version: "0.1"
status: "canonical"
last_updated: "2026-07-03"
tags: ["getting-started", "quickstart", "install"]
nav:
  order: 1
---

# Quickstart

This page takes you from an empty directory to a running Zenith app, then adds one reactive component, one route, and one server `load(ctx)`. Every snippet below uses canonical Zenith syntax and is the same shape the scaffold generates.

## 1. Create a project

Zenith ships a `create-zenith` scaffold. Run it with your preferred package manager:

```bash
npm create zenith@latest
# or: bun create zenith
# or: pnpm create zenith
```

The scaffold asks for a project name and a starter template. The default **CSS** starter is a small multi-page app and is what this guide follows. It also offers optional ESLint, Prettier, and a TypeScript path alias; answer `No` to any of them and the generated project contains nothing for that tool.

To skip prompts entirely, for example in CI:

```bash
npm create zenith@latest my-app -- --template css
```

`create-zenith` installs dependencies for you. If it could not (for example, no detected package manager), finish the install manually:

```bash
cd my-app
npm install
```

## 2. Run the dev server

From the project root:

```bash
npm run dev
```

This runs `zenith dev`. Open the printed local URL and you should see the starter home page. The starter is a static, multi-page site: links are plain semantic anchors, so each navigation is a normal browser request.

The generated project looks like this:

```txt
my-app/
  zenith.config.js   # Zenith config (target, pagesDir, ...)
  package.json       # scripts: dev, build, preview
  src/
    layouts/DefaultLayout.zen   # shared layout (<slot />)
    pages/index.zen             # home route -> "/"
    pages/about.zen             # about route -> "/about"
    styles/global.css           # global styles
```

Pages map to routes by file path: `src/pages/index.zen` is `/`, and `src/pages/about.zen` is `/about`. See [Routing Contract](/docs/contracts/routing) for the full route-shape rules.

## 3. Make a reactive component

The home page already ships a counter built on a `signal`. Open `src/pages/index.zen`:

```zen
<script setup="ts">
const count = signal(0);

function increment() {
    count.set(count.get() + 1);
}
</script>

<DefaultLayout>
    <section class="container">
        <h1>Zenith Starter</h1>
        <button on:click={increment} class="button">Count: {count}</button>
    </section>
</DefaultLayout>
```

Two things to notice:

- `on:click={increment}` binds a **function reference**. Direct calls like `on:click={increment()}` are rejected at compile time.
- `{count}` is a reactive interpolation. The DOM updates when the bound value changes.

For a reusable piece of UI, author a component. Create `src/components/Counter.zen`:

```zen
<script lang="ts">
interface Props {
    start?: number;
}

const incoming = props as Props;
state count = incoming.start ?? 0;

function increment() {
    count += 1;
}
</script>

<button on:click={increment} class="button">Count: {count}</button>
```

Use `state` for values that directly drive DOM updates; use `signal()` for stable identity and explicit `get()`/`set()`. Both are canonical. See [Reactivity Model](/docs/reactivity/reactivity-model) for the primitive boundaries.

Import and use the component in `src/pages/index.zen`:

```zen
<script setup="ts">
import "../styles/global.css";
import Counter from "../components/Counter.zen";
</script>

<DefaultLayout>
    <section class="container">
        <h1>My Zenith App</h1>
        <Counter start={5} />
    </section>
</DefaultLayout>
```

Save and the dev server rebuilds. The button now counts up from 5.

## 4. Add a route

Create `src/pages/notes.zen`:

```zen
<DefaultLayout>
    <section class="container">
        <h1>Notes</h1>
        <p>This route lives at src/pages/notes.zen and maps to /notes.</p>
        <a href="/" class="link">Back home</a>
    </section>
</DefaultLayout>
```

Save and visit `/notes` in the browser. That is the whole route: a file under `src/pages` becomes a route by its path. No route registration file is needed.

Client-side soft navigation is opt-in and off by default. To enhance an anchor into a client-side transition, mark it with `data-zen-link` and enable the router in `zenith.config.js` (`router: true`). Plain anchors keep working either way. See [Navigation Contract](/docs/contracts/navigation) and [ZenLink](/docs/reference/zenlink).

## 5. Add server data with load(ctx)

Server data loading uses `load(ctx)` in a `<script server lang="ts">` block. `load` runs on the server before HTML is returned, so a page that uses it needs a server-capable build target.

First, switch the build target in `zenith.config.js` from `static` to `node`:

```js
export default {
    pagesDir: 'src/pages',
    target: 'node',
    typescriptDefault: true
};
```

Routes that export `guard`, `action`, or `load` cannot be statically generated. The `static` target fails the build for such routes; `node` runs them on the server. See [Deployment Targets](/docs/guides/deployment-targets) for the full target matrix.

Create `src/pages/dashboard.zen`:

```zen
<script server lang="ts">
import { data } from 'zenith:server-contract';

export async function load(ctx) {
    const host = ctx.url.hostname || 'localhost';
    const visits = Math.floor(Math.random() * 100) + 1;
    return data({ host, visits });
}
</script>

<DefaultLayout>
    <section class="container">
        <h1>Dashboard</h1>
        <p>Served from {data.host}.</p>
        <p>Visits: {data.visits}</p>
    </section>
</DefaultLayout>
```

`load(ctx)` receives a single context object with `ctx.url`, `ctx.params`, `ctx.request`, and more. It returns `data(payload)`, `redirect(...)`, or `deny(...)`. Returning a plain object is treated the same as `data(payload)`. The payload must be a JSON-safe plain object, and it is available in the template as `data`.

`zenith dev` runs server routes the same way in development. Visit `/dashboard` and reload a few times to see the server value change.

## 6. Build and preview

```bash
npm run build
npm run preview
```

`zenith build` writes canonical output and then adapts it to the selected target. `zenith preview` serves the built target output without recompiling, so it previews the real deployment shape. For the `node` target, preview boots the packaged server artifact.

## Next steps

- [Install and Compatibility](/docs/install-compatibility) for native toolchain packages and version policy.
- [Reactivity Model](/docs/reactivity/reactivity-model) for `state`, `signal`, and `ref` boundaries.
- [Events](/docs/syntax/events) for the universal event binding rules.
- [Route Protection](/docs/routing/route-protection) for `guard(ctx)`, `action(ctx)`, and `ctx.auth` sessions.
- [Deployment Targets](/docs/guides/deployment-targets) for the target matrix and current limitations.
- [CLI Contract](/docs/cli-contract) for command guarantees and exit semantics.
