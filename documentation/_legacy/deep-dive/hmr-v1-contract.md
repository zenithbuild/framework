# Zenith V1 HMR Contract

This document acts as the single source of truth for the Hot Module Replacement (HMR) system connecting the Zenith CLI Development Server (`@zenithbuild/cli`) to the Zenith Runtime Applier (`@zenithbuild/runtime`).

## Structural Responsibilities

**Single Source of Injection**: 
The HMR client code is maintained exclusively by the `@zenithbuild/runtime` package. The dev server must **never** inject its own arbitrary script tag payload.

**Endpoints**:
The dev server hosts two specialized application endpoints on its port:
- `GET /__zenith_dev/events`: A Server-Sent Events (SSE) stream returning granular event payloads (`Cache-Control: no-store`).
- `GET /__zenith_dev/state`: A JSON payload indicating the immediate compilation state synchronously (`Cache-Control: no-store`).

Both endpoints utilize **same-origin headers only** (they do not rely on permissive CORS).

## Dev State Schema

The Zenith development server must maintain and vend the following state object on `/__zenith_dev/state`:

```javascript
{
  "buildId": number,      // Monotonically increasing build integer
  "status": string,       // 'ok' | 'building' | 'error'
  "lastBuildMs": number,  // Unix timestamp of the last successful compilation
  "durationMs": number,   // Build execution time in milliseconds
  "cssHref": string,      // Path to the current active stylesheet mapping
  "error": object | null  // Compiler error metadata shape, or null
}
```

## SSE Event Flow

Connected dev clients on `/__zenith_dev/events` must receive properly framed Server-Sent Events structured via `event: <name>\n data: {...}\n\n`.

### Allowed Events

- **`connected`**: Emitted instantly upon client initialization to flush buffer bytes.
- **`build_start`**: Emitted when physical file changes trigger the debounced compilation watcher.
- **`build_complete`**: Emitted universally upon a successful completion of the compiler process.
- **`build_error`**: Emitted if the compiler panics or fails to emit valid syntax outputs. Contains `message` payload clamped to a reasonable buffer scale to avoid stream bloat.
- **`css_update`**: Emitted when CSS rules should cleanly patch the DOM without losing runtime state. Must ONLY be emitted after `build_complete`.
- **`reload`**: Emitted when `.zen` macros, JavaScript definitions, or server exports materially change the routing map. Must ONLY be emitted after `build_complete`.

### Operational Guarantees
1. A single cohesive compilation sequence maintains the **same mono-directional `buildId`** across its events (e.g., `build_start`, `build_complete`, and `css_update` must refer to the same unified `buildId`).
2. There are strictly paired sequences. Every `build_start` MUST be definitively followed by exactly one `build_complete` OR one `build_error`. There are no hanging builds.
3. Node server execution is crash-proof. Malformed component scripts parsed by `zenith-compiler` should update `status=error` and pipe downstream rather than aborting the watcher process.
