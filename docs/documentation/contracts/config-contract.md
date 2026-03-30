---
title: "Config Contract"
description: "Formal definition of the definitive Zenith configuration contract."
version: "0.4"
status: "canonical"
last_updated: "2026-03-29"
tags: ["contracts", "config", "schema"]
---

# Config Contract

This document formally defines the definitive Zenith configuration contract.

## 1. Supported Keys
Zenith supports **exactly 10 top-level keys** in its configuration schema. 
Of those, 9 are standard public keys, while 1 (`adapter`) remains an advanced/unstable hook.
Any unknown key present in a configuration file explicitly fails fast with a validation error and aborts the load.

### Schema Properties

| Key | Type | Default | Description |
|---|---|---|---|
| `router` | `boolean` | `false` | Enables the built-in signal-based router. |
| `embeddedMarkupExpressions` | `boolean` | `false` | Enables experimental markup `{expression}` bindings. |
| `typescriptDefault` | `boolean` | `true` | Defaults to TS for unannotated `<script>` tags. |
| `outDir` | `string` | `'dist'` | Directory where build output is written. |
| `pagesDir` | `string` | `'pages'` | Directory containing routing endpoints (`.zen` / `.md`). |
| `basePath` | `string` | `'/'` | The prefix applied to all framework URLs and assets. |
| `target` | `string` | `'static'` | Standard deployment mode (`static`, `static-export`, `node`, `vercel`, `netlify`, `vercel-static`, `netlify-static`). |
| `adapter` | `object` | `null` | **[Advanced]** Provide a custom deployment adapter. Mutually exclusive with `target`. |
| `strictDomLints` | `boolean` | `false` | Promotes Zenith DOM AST warnings into fatal compilation errors. |
| `images` | `object` | *See Source* | Explicit image generation, format, caching, and layout constraints. |

## 2. Precedence Order
Zenith configuration properties are resolved via a strict precedence hierarchy:
1. **Configuration File (`zenith.config.ts` or `zenith.config.js`)**
2. **Internal Framework Defaults**

**Single File Loading Constraint:**  
Zenith loads exactly **one** config file per project root. It will not attempt to deep-merge multiple configuration files. If both `.ts` and `.js` config files are found, the loader throws a validation error and requires the user to delete one.

**Operational CLI Flags vs Schema:**  
CLI listener options like `--port`, `--host`, or environment variables (`ZENITH_DEV_PORT`) are operational deployment flags. They control the node listener orchestrating the CLI commands rather than mutating the framework `ZenithConfig` payload. They are not part of the config schema.

## 3. Trust Boundary
The configuration file is **executable code running with host node privileges**.

- **Execution Environment**: Configs execute natively in the Node.js process without a sandbox. They have full access to `process`, `fs`, `http`, etc.
- **Transpilation Rules**: If the config uses `.ts`, Zenith transpiles the file just-in-time, writes the intermediate form temporarily to the filesystem, and dynamically imports it using V8 module resolution.
- **Validation**: Zenith strictly validates the *resultant exported object* against the schema types. It does not sandbox or analyze the code used to generate that object.

Ensure all Zenith configurations come from trusted source control.
