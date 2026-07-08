# Zenith Tailwind Rules

Zenith projects use Tailwind utility classes. Do not drift into generic CSS.

## Tokens first

Use Tailwind tokens for spacing, color, typography, shadows, borders, and layout.

```zen
<div class="flex items-center gap-4 px-4 py-2 bg-slate-900 text-white rounded-lg shadow-md">
  ...
</div>
```

## Dark mode

Use `dark:` variants, not manual media queries or raw CSS variables.

```zen
<div class="bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
  ...
</div>
```

## Forbidden

- Hardcoded hex colors like `#1e293b` unless the Tailwind config defines them.
- Arbitrary values like `w-[123px]` unless the design system allows them.
- Inline `<style>` blocks that duplicate Tailwind tokens.
- Global CSS resets that override the Tailwind base layer without approval.

## When to use raw values

Only when the Tailwind config already exposes them as theme tokens or CSS custom properties. Prefer `theme(...)` values or configured utilities.

## Summary

- Tailwind tokens first.
- `dark:` variants for dark mode.
- No raw hex unless themed.
- No generic CSS drift.
