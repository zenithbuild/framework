---
title: "Zen Components"
order: 1
---

# Zenith Components: The Building Blocks of Beauty

A molecule of logic, a cell of the view,
A Zenith component, created by you.
With props as the message, and state as the soul,
They work in a chorus to reach for the goal.

Small and expressive, or grand in their scale,
They tell in the browser a wonderful tale.

---

## 🏗 Anatomy of a Zenith Component

Every `.zen` file is a sovereign entity. It encapsulates its own logic, template, and styles.

```html
<script setup="ts">
  // 1. Props (received from parent)
  const { title, icon } = props
  
  // 2. Local State
  state isOpen = false
  
  // 3. Logic
  const toggle = () => isOpen = !isOpen
</script>

<div class="card">
  <header onclick="toggle">
    <span>{icon}</span>
    <h2>{title}</h2>
  </header>
  
  {isOpen && (
    <div class="content">
      <slot />
    </div>
  )}
</div>

<style>
  .card { border: 1px solid #ccc; }
</style>
```

## 🛠 Functional Components

While `.zen` SFCs are the standard, Zenith also supports light functional components defined within expressions.

```javascript
const UserBadge = (user) => (
  <div class="badge">
    <img src={user.avatar} />
    <span>{user.name}</span>
  </div>
)
```

## 📦 Component Communication

### Props: The Downward Flow
Data enters components via `props`. These are reactive—if the parent changes the prop value, the child will reflect that change.

### Events: The Upward Reach
To communicate back to a parent, siblings, or the global state, Zenith components use standard JavaScript events or shared reactive stores.

---

## 💡 Pro Tip: Naming Conventions

Zenith doesn't enforce a strict naming convention, but following the "PascalCase" rule for component files (e.g., `UserCard.zen`) and "camelCase" for variables and functions will keep your codebase readable and consistent with the broader JavaScript ecosystem.

**Next Step**: [Composition and Slots](../components/composition.md)
