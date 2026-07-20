---
title: "Config Contract"
description: "Formal definition of the definitive Zenith configuration contract."
version: "0.4"
status: "canonical"
last_updated: "2026-05-25"
tags: ["contracts", "config", "schema"]
section: "Build and Tooling"
sectionOrder: 6
order: 3
---

# Config Contract

This document formally defines the definitive Zenith configuration contract.

## 1. Supported Keys
Zenith supports **exactly 11 top-level keys** in its configuration schema.
Of those, 10 are standard public keys, while 1 (`adapter`) remains an advanced/unstable hook.
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
| `plugins` | `array` | `[]` | Config-time V1 plugins. Only named plugin objects with an optional `config()` hook are supported. |

### V1 Plugin Configuration

Plugins are configured in `zenith.config.js` or `zenith.config.ts`:

```js
function authPlugin() {
  return {
    name: 'auth',
    config() {
      return { basePath: '/app' };
    }
  };
}

function mdxPlugin() {
  return { name: 'mdx' };
}

export default {
  plugins: [authPlugin(), mdxPlugin()]
};
```

V1 plugins are config-time only. A plugin must return a named object, and the only supported hook is `config()`. The hook receives a frozen resolved config snapshot and may return a conservative config patch for safe keys only: `router`, `embeddedMarkupExpressions`, `typescriptDefault`, `strictDomLints`, `images`, `basePath`, and `outDir`.

V1 config patches are shallow top-level patches; scalar keys such as `router` replace their value, and nested object keys such as `images` replace that config object instead of deep-merging.

V1 plugins cannot transform files, register middleware, mutate routes/security policy, patch `target`, patch `pagesDir`, or install compiler/bundler/dev-server hooks. Root global middleware is a TypeScript-only file-based route feature, not plugin registration and not a config API.

## 2. Precedence Order
Zenith configuration properties are resolved via a strict precedence hierarchy:
1. **Configuration File (`zenith.config.ts` or `zenith.config.js`)**
2. **Internal Framework Defaults**

**Single File Loading Constraint:**  
Zenith loads exactly **one** config file per project root. It will not attempt to deep-merge multiple configuration files. If both `.ts` and `.js` config files are found, the loader throws a validation error and requires the user to delete one.

**Operational CLI Flags vs Schema:**  
CLI listener options like `--port`, `--host`, or environment variables (`ZENITH_DEV_PORT`) are operational deployment flags. They control the node listener orchestrating the CLI commands rather than mutating the framework `ZenithConfig` payload. They are not part of the config schema.

Dev tracing is also operational. Use `ZENITH_DEV_TRACE=1`; `devTrace` is not a supported config key.

**Dev Server Config Changes:**
Changes to `zenith.config.ts` or `zenith.config.js` while `zenith dev` is running require a restart. When the dev watcher observes a config-file edit, it warns instead of rebuilding with stale config.

## 3. Trust Boundary
The configuration file is **executable code running with host node privileges**.

- **Execution Environment**: Configs execute natively in the Node.js process without a sandbox. They have full access to `process`, `fs`, `http`, etc.
- **Transpilation Rules**: If the config uses `.ts`, Zenith transpiles the file just-in-time, writes the intermediate form temporarily to the filesystem, and dynamically imports it using V8 module resolution.
- **Validation**: Zenith strictly validates the *resultant exported object* against the schema types. It does not sandbox or analyze the code used to generate that object.

Ensure all Zenith configurations come from trusted source control.
