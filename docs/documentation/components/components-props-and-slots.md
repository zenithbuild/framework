---
title: "Components, Props, and Slots"
description: "Compose .zen components with explicit props and parent-owned slot scope."
version: "0.8"
status: "canonical"
last_updated: "2026-07-13"
tags: ["components", "props", "slots"]
section: "Core Concepts"
sectionOrder: 2
order: 3
---

# Components, Props, and Slots

Components are structural composition boundaries. Props carry explicit values into the component, while slot expressions keep the parent scope that authored them.

## Define Props

```zen
<script setup="ts">
interface Props {
  title?: string
}

const incoming = props as Props
const title = incoming.title || "Zenith card"
</script>

<article>
  <h2>{title}</h2>
  <slot />
</article>
```

The compiler owns prop serialization. Do not infer props from the DOM or expect implicit conversion into reactive state.

## Pass Content

```zen
<script setup="ts">
const summary = "Parent-owned content"
</script>

<Card title="Compiler first">
  <p>{summary}</p>
</Card>
```

`summary` resolves in the parent scope. Component-local state does not silently rebind expressions authored in the slot.

## Pass Handlers

Handler props remain real function references:

```zen
<script setup="ts">
function save() {}
</script>

<Button onPress={save}></Button>
```

The component implementation binds the prop with canonical DOM syntax such as `on:click={incoming.onPress}`. Optional callbacks need a function-valued wrapper at the final event binding.

Next: [Reactivity Model](/docs/reactivity/reactivity-model).
