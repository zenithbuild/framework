---
title: "Syntax Cheatsheet"
order: 3
---

# Syntax Cheatsheet: The Quick Reference

A single glance, a moment of your time,
To find the syntax, reason, and the rhyme.
From templates bold to state that's ever new,
The Zenith secrets, laid out here for you.

Keep this at hand, your constant daily friend,
Until the project reaches its perfect end.

---

## 📋 Template Syntax

| Feature | Zenith Syntax |
| :--- | :--- |
| **Interpolation** | `<div>{variable}</div>` |
| **Attributes** | `<div class={color}></div>` |
| **Loops** | `{items.map(item => <li>{item}</li>)}` |
| **Conditionals** | `{show && <div>Visible</div>}` |
| **Event Binding** | `<button onclick="handler">Click</button>` |
| **Slots** | `<slot />` or `<slot name="header" />` |

## 📦 Script Syntax

| Feature | Zenith Syntax |
| :--- | :--- |
| **State** | `state count = 0` |
| **Props** | `const { title } = props` |
| **Mount Hook** | `zenOnMount(() => { ... })` |
| **Update Hook** | `zenOnUpdate(() => { ... })` |
| **Unmount Hook** | `zenOnUnmount(() => { ... })` |

## 📚 Content Engine

| Feature | Zenith Syntax |
| :--- | :--- |
| **Fetch Collection** | `zenCollection('blog').get()` |
| **Filtering** | `.where(doc => !doc.draft)` |
| **Sorting** | `.sortBy('date', 'desc')` |
| **Limiting** | `.limit(5)` |

---

## 💡 Pro Tip: Keyboard Shortcuts

If you're using the [Zenith VS Code Extension](https://github.com/zenithbuild/zenith-vscode), remember that `z-setup` is a powerful snippet for generating a fresh component skeleton, including the script and template blocks!

**The End of the Suite. Happy Coding!**
