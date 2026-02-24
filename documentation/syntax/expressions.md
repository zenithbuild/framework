---
title: "Expressions"
order: 1
---

# Zenith Expression Contract

Status: Active  
Scope: `.zen` markup expressions (`{...}`), attribute bindings, and event bindings.

This contract defines what expressions can do, what they cannot do, and how the compiler/runtime must behave.

## 1) Core Rule

Expressions are JavaScript/TypeScript expressions inside `{ ... }`.

Examples:

```zen
<p>{userName}</p>
<p>{count * 2}</p>
<p>{isLoading ? "Loading..." : "Ready"}</p>
```

No statement blocks are allowed in markup expression positions.

## 2) Determinism Rules (Compiler Contract)

The compiler must preserve expression identity exactly:

- One source expression becomes one expression entry.
- Expressions are never split.
- Expressions are never merged.
- Expressions are never wrapped with hidden user-facing helpers.
- Expression order is stable by source order.
- Attribute/event expressions are indexed in source order with child expressions.

## 3) Where Expressions Are Allowed

### 3.1 Text positions

```zen
<p>{title}</p>
```

### 3.2 Attribute positions

```zen
<div class={isActive ? "active" : "idle"} />
```

### 3.3 Event bindings (object-based only)

```zen
<button on:click={handleClick}>Toggle</button>
```

## 4) Renderable Semantics

Expression results are rendered with these rules:

- `string`, `number` -> rendered as text
- `null`, `undefined`, `false`, `true` -> render nothing
- arrays -> flattened recursively in order
- embedded-markup fragments (compiler-generated) -> inserted as fragment output

## 5) Ternaries and Maps

### 5.1 Ternary expression

```zen
<span>{isDark.get() ? "🌙" : "☀"}</span>
```

### 5.2 Map to text

```zen
<p>{items.map((x) => x.name).join(", ")}</p>
```

### 5.3 Map to markup

When embedded markup expressions are enabled:

```zen
<ul>
  {items.map((x) => (
    <li>{x.name}</li>
  ))}
</ul>
```

Compiler lowering is deterministic (`__z_frag_*` factories), with no React/JSX runtime.

## 6) Embedded Markup Expression Modes

### Mode A: `embeddedMarkupExpressions = true`

- Inline element literals in expressions are allowed: `(<li>...</li>)`.
- `zenhtml\`...\`` is forbidden in this mode.

### Mode B: `embeddedMarkupExpressions = false`

- Inline element literals in expressions are forbidden.
- `zenhtml\`...\`` is required for markup-in-expression behavior.

## 7) Security and Hard Bans

Compile-time hard errors:

- String event handlers are forbidden (`onclick="..."`).
- `<script>` tags inside embedded markup literals are forbidden.
- Svelte block tags are forbidden (`{#each}`, `{#if}`, `{:else}`, `{/each}`, ...).

Framework/runtime bans:

- No React runtime (`react/jsx-runtime`).
- No string-based event binding model.

## 8) Escaping and Raw HTML

- Normal expression output is escaped by default.
- Raw HTML must be explicit (`innerHTML={...}`) and should be sanitized upstream.
- Never pass untrusted HTML directly without sanitization.

## 9) Practical Patterns

### Theme icon ternary in markup

```zen
<span>{isDark.get() ? "🌙" : "☀"}</span>
```

### List rendering

```zen
<ul>
  {contributors.map((c) => (
    <li>{c.name}</li>
  ))}
</ul>
```

### Event binding

```zen
<button on:click={toggleTheme}>Toggle Theme</button>
```

## 10) Non-goals

Zenith expressions are not a hook system and not a virtual DOM API.

- No `useRouter`, `useParams`, `useEffect`, etc.
- No Svelte control-flow blocks.
- No framework-specific runtime magic for expression semantics.
