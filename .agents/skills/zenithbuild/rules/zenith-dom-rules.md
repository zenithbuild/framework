# Zenith DOM and Environment Rules

Apply these rules inside `.zen` scripts.

## Refs

Use `ref<T>()` for DOM access, focus, measurement, and animation.

```ts
const buttonRef = ref<HTMLButtonElement>()
```

```zen
<button ref={buttonRef} on:click={handleClick}>Click</button>
```

## Forbidden selectors

Do not use `querySelector`, `querySelectorAll`, or `getElementById` in `.zen` scripts.

Rare interop exception:

```ts
// zen-allow:dom-query third-party widget root not exposed as a ref
const legacyRoot = document.querySelector('#legacy-widget')
```

## Event subscriptions

Use `zenOn(target, eventName, handler, options?)` instead of `addEventListener`.

```ts
zenMount((ctx) => {
  const doc = zenDocument()
  if (!doc) return
  const off = zenOn(doc, 'keydown', (e) => {
    if (e.key === 'Escape') closeMenu()
  })
  ctx.cleanup(off)
})
```

## Global DOM access

Use `zenWindow()` and `zenDocument()` for SSR-safe global access. They return `null` outside the browser.

```ts
zenMount((ctx) => {
  const win = zenWindow()
  const doc = zenDocument()
  if (!win || !doc) return
  // browser-only logic
})
```

## Resize-driven updates

Use `zenResize(handler)` for reactive window resize updates.

```ts
zenMount((ctx) => {
  const off = zenResize(({ w, h }) => viewport.set({ w, h }))
  ctx.cleanup(off)
})
```

## Multi-node operations

Use `collectRefs(...refs)` for deterministic node lists.

```ts
const nodes = collectRefs(linkRefA, linkRefB, linkRefC)
```

## Summary

- `ref<T>()` for DOM handles.
- `zenWindow()` / `zenDocument()` for global access.
- `zenOn()` for subscriptions.
- `zenResize()` for resize-driven reactivity.
- `collectRefs()` for multiple nodes.
- No `querySelector` / `addEventListener` in `.zen` scripts without an explicit allowance comment.
