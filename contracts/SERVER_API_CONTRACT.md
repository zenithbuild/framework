# Zenith Server API Contract

Status: Locked
Scope: `<script server>` execution, data fetching, and payload serialization.

This document defines the strict, canonical rules for server-side exports in Zenith pages (`.zen` files). Any proposal that introduces "magic globals" or implicit runtime context violates this contract.

## 1. Allowed Exports

In a `<script server>` block, only the following public API exports are permitted:

- `export const data = { ... }` (for static/simple data)
- `export const load = async (ctx) => ({ ... })` (for dynamic/request-based data)
- `export const prerender = boolean` (optional, compile-time routing flag)

*Note: Legacy exports (`ssr_data`, `props`, `ssr`) are supported for backward compatibility but are strictly deprecated.*

## 2. Mutual Exclusion Rules

To ensure deterministic payload resolution, exports MUST NOT be mixed. 

- **Fatal Error**: Exporting both `data` and `load` in the same file.
- **Fatal Error**: Mixing new APIs (`data` or `load`) with legacy APIs (`ssr_data`, `props`, `ssr`).
- **Fatal Error**: `prerender` exported as anything other than a boolean.
- **Fatal Error**: Any illegal / unknown exports (e.g. `export const secret = ...`) MUST be strictly rejected by the compiler.

### Examples

**Valid:**
```javascript
export const data = { title: "Hello World" };
export const prerender = true;
```

**Invalid:**
```javascript
export const load = async (ctx) => ({ title: "Hello" });
export const secret = process.env.API_KEY; // ILLEGAL EXPORT
```

## 3. Function Arity Enforcement

The `load` function MUST explicitly declare its dependencies to prevent implicit global magic:

- **Fatal Error**: `load` is not a function.
- **Fatal Error**: `load` does not take exactly one argument (e.g., `load()` or `load(ctx, somethingElse)`).
  *Correct*: `export const load = async (ctx) => { ... }`

## 4. Server Load Context (`ctx`)

When `load(ctx)` is invoked, it receives a strictly defined request snapshot:

```typescript
interface LoadContext {
  params: Record<string, string>; // Route parameters (e.g., { slug: "hello" })
  url: URL;                       // Full request URL
  request: Request;               // Standard Fetch API Request object
  route: {                        // Deterministic route metadata
    id: string;                   // Route identifier
    file: string;                 // Relative path to the .zen file
    pattern: string;              // Route matching pattern
  };
}
```

- **Rule**: No magic globals. `data`, `params`, and `ctx` are NOT globally available in `.zen` files. You must explicitly export `load` to access the context.

## 5. Strict Serialization Boundaries

The returned payload from `data` or `load(ctx)` MUST be a top-level Plain Object. It is rigorously checked before injection into the HTML.

- **Fatal Error**: The payload is an Array `[]`. It MUST be an object.
- **Fatal Error**: The payload contains `undefined` values.
- **Fatal Error**: The payload contains `function`, `symbol`, or `bigint`.
- **Fatal Error**: The payload contains instances of `Map`, `Set`, or `Date` (Dates must be converted to ISO strings).
- **Fatal Error**: The payload contains prototype pollution keys (`__proto__`, `constructor`, `prototype`).
- **Fatal Error**: The payload contains circular references.
- **Fatal Error**: The payload contains non-plain objects (classes, custom prototypes).

The compiled framework guarantees that whatever `load` or `data` returns can be safely encoded as JSON without silent data loss.

## 6. Error Envelope Context

If a server data operation fails, the framework catches the error and injects a deterministic top-level error envelope into the page payload rather than silent failure:

```json
{
  "__zenith_error": {
    "status": 500,
    "code": "LOAD_FAILED",
    "message": "Human-readable error"
  }
}
```

- Pages are expected to handle `data.__zenith_error` and render appropriate fallback UI.

## 7. No Framework Leakage

- Framework tools (CLI, Compiler, Router, Runtime) MUST remain CMS-agnostic.
- The Zenith core contains no references to "Directus", "docs_pages", or "cmsPosts".
- The compiler does NOT read CMS schemas or map components magically. Components remain strictly structural.
