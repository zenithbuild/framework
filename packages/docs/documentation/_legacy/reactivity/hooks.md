---
title: "Hooks"
order: 2
---

# Lifecycle and Effects

Zenith uses two primary lifecycle boundaries in component scripts:

- `zenMount(...)` for mount/unmount setup.
- `zeneffect(...)` for reactive side effects.

## `zenMount`

Runs once after mount. Return a cleanup function for unmount.

```zen
<script lang="ts">
zenMount(() => {
  const runtime = globalThis;
  const win = runtime["window"];
  if (!win) {
    return;
  }

  const onResize = () => {
    // keep local metrics in sync
  };

  win.addEventListener("resize", onResize);

  return () => {
    win.removeEventListener("resize", onResize);
  };
});
</script>
```

## `zeneffect`

Runs when dependencies change. Return cleanup to stop previous side effects.

```zen
<script lang="ts">
import { gsap } from "gsap";

const panelRef = ref();
state expanded = false;

function togglePanel() {
  expanded = !expanded;
}

zeneffect([expanded, panelRef], () => {
  const panel = panelRef.current;
  if (!panel) {
    return;
  }

  const tween = gsap.to(panel, {
    height: expanded ? 280 : 140,
    duration: 0.45,
    ease: "power3.inOut"
  });

  return () => {
    tween.kill();
  };
});
</script>

<button on:click={togglePanel}>Toggle</button>
<div ref={panelRef}></div>
```

## Notes

- Keep DOM/animation side effects in `zeneffect`.
- Keep one-time subscriptions and teardown in `zenMount`.
- Use `on:click={handler}` for events; never `onclick="..."`.
