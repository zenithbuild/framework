# Vendor Bundling Walkthrough

## Scope

Zenith vendor bundling is for third-party **framework-neutral ESM libraries** such as:

- `gsap`
- `three`
- `date-fns`

It is **not** a framework interop system.

## Example

```js
import { gsap } from "gsap";

export function pulse(node) {
  return gsap.to(node, { opacity: 0.4, duration: 0.2, yoyo: true, repeat: 1 });
}
```

When external specifiers are present:

1. Bundler emits `assets/vendor.<hash>.js`.
2. Manifest includes `vendor: "/assets/vendor.<hash>.js"`.
3. Bare imports are rewritten to emitted vendor assets in runtime graph modules.

## CSS Framework Note

Zenith currently treats CSS as deterministic opaque input.

- Local CSS imports always work (for example `import "./styles/output.css";`).
- Tailwind or other framework engines are a pre-step for now; compile them to plain CSS first, then import that output file into Zenith.

## Framework Interop Policy (Hard Gate)

The following imports are blocked until a dedicated adapter/islands layer exists:

- `react`
- `react-dom`
- `vue`
- `svelte`
- `solid-js`
- `preact`
- `lit`
- `@angular/core`

Diagnostic:

`Framework interop imports are not supported yet. If you want this, we need an explicit adapter/islands layer.`
