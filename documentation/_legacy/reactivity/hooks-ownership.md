# Hook Ownership Rule

In Zenith, every hook has a single, authoritative owner. This rule ensures that the core remains minimal, plugins remain removable, and the architecture remains predictable.

## 🔐 The Canonical Rule

> **Core provides the stage. Plugins bring the actors. The compiler writes the script.**

A hook's owner is the only entity permitted to define it, emit it, and document it. Ownership is determined by universality and necessity.

---

## 🧱 Rule 1: Core Hook Ownership

Core may define only hooks that are **universally valid** in all Zenith applications. 

A core hook must satisfy **all** of these criteria:
1. Works without any plugins installed.
2. Has meaning in every single project.
3. Is emitted unconditionally by the compiler or core runtime.
4. Represents a structural or lifecycle boundary.

**Examples of Core Hooks:**
- `zenMount`: Mount lifecycle boundary (with optional cleanup return).
- `zeneffect`: Reactive side-effect boundary.

---

## 🧩 Rule 2: Plugin Hook Ownership

If a hook exists because a plugin exists, **the plugin owns it.** Core must not define, name, or reference it.

**Examples of Plugin Hooks:**
- `beforeEach`: Navigation guard (Owned by `zenith-router`).
- `onContentReady`: Content lifecycle (Owned by `zenith-content`).
- `useZenOrder`: Documentation helper (Owned by `zenith-content`).

### Requirements for Plugin Hooks:
- Must be defined and exported by the plugin.
- Must register themselves into the core's generic registry if needed.
- Must be documented locally within the plugin's documentation.

---

## 🔄 Rule 3: Direction of Dependency

Dependencies must always flow in one direction:
`Core ← Plugin ← User Code`

1. **Core never imports plugins.**
2. **Core never mentions plugin hooks or types.**
3. **Plugins depend on Core** (reactivity, generic lifecycle).
4. **Users depend on Plugins** for specific functionality.

---

## ✅ Rule 4: The Removability Test

A plugin is correctly implemented only if:
- **Removing it causes NO core changes.**
- **Core builds and runs identically** (only features disappear).
- **No dangling types or logic remain** in the core.

If removing a plugin requires a code change in `zenith-core`, the architecture is invalid.

---

## 🧠 Final Principle

Zenith achieve seamlessness through **compile-time indirection**, not runtime coupling. 

- **Runtime** stays dumb and minimal.
- **Compiler** is the only place where these worlds meet.
- **Plugins** are self-contained power-ups.

## Current API Naming

For core lifecycle/reactivity docs and examples, use:

- `zenMount(...)`
- `zeneffect(...)`

Do not publish new examples using legacy names such as `zenOnMount`, `zenOnUnmount`, or `zenOnUpdate`.
