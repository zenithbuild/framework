---
title: "Installation"
order: 1
---

# Installation: The Zenith Genesis

In silence, void, where code begins to stir,
A framework waits, for those who choose the spur.
With Bun at hand, and terminal in sight,
We bring the Zenith sparks into the light.

No heavy chains, no legacy to bind,
Just speed and logic, artfully aligned.

---

## 🚀 Quick Start

Zenith lives where performance is paramount. To begin your journey, you'll need [Bun](https://bun.sh) installed on your system.

### Create a New Project

The swiftest way to spawn a Zenith application is through our CLI:

```bash
bun create zenith my-zenith-app
cd my-zenith-app
bun run dev
```

### Manual Installation

Should you wish to weave Zenith into an existing tapestry, install the core and its companions:

```bash
bun add @zenithbuild/core
bun add -d tailwindcss @tailwindcss/cli
```

## 🛠 Prerequisites

To ensure your environment is ready for the Zenith bloom:

1. **Bun**: Version 1.1.0 or higher.
2. **Tailwind CSS**: (Optional but recommended) For our utility-first styling system.

## 📁 Project Anatomy

A standard Zenith workspace follows a clean, predictable path:

- `src/pages/`: Your routes (e.g., `index.zen`).
- `src/layouts/`: Shared wrappers for your pages.
- `src/styles/`: Global CSS and Tailwind configuration.
- `content/`: Your static content collections.

> [!TIP]
> Zenith uses `.zen` files for components. These are single-file masterpieces containing your script, template, and optional styles.

---

## 🌌 Deep Dive: Why Bun?

Zenith is built from the ground up to leverage Bun's incredible speed. From the development feedback loop to the ultra-fast compiler, every part of the Zenith engine is tuned for the Bun runtime. While we aim for compatibility, the true Zenith experience is found in the Bun ecosystem.

**Next Step**: [Create your first component](../getting-started/first-component.md)
