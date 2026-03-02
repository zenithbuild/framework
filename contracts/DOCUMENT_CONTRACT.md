# Zenith Document Ownership & Layout Contract

This document defines the strict ownership rules for HTML document structure, Layout resolution, and Slot behavior in the Zenith framework.

## 1. Document Ownership
**Only Layouts may emit the root `<html>` element.**
- **Pages (Routes)**: Must NOT contain `<html>`, `<head>`, or `<body>` tags at the root level. They simply provide content.
- **Components**: Must NOT contain `<html>` tags. They are fragments.
- **Layouts**: MUST provide the full `<html>`, `<head>`, and `<body>` structure.

**Validation Rules:**
- The compiler enforces that any file ending in `.zen` which is NOT a Layout cannot emit `<html>`.
- The final output (Page + Layout) must be a valid HTML document with exactly one `<head>` and one `<body>`.
- Nested `<html>` tags are strictly forbidden.

## 2. Layout Resolution
Layouts are detected by their **Canonical File Path**.
- Any component imports resolving to `src/layouts/...` are treated as Layouts.
- Circular dependencies (Layout A imports Layout B imports Layout A) are detected and explicitly forbidden.
- Layouts are **Recursive**: A layout can import another layout (Parent Layout), creating a chain.
  - The "Child" layout fills the "Parent" layout's `<slot />`.

## 3. Slot Contract
The `<slot />` element is the **only** mechanism for content injection.
- **Attributes Forbidden**: `<slot name="foo" />` or `<slot class="foo" />` is invalid. Slots are attribute-free.
- **Single Slot Policy**: A Layout must contain **exactly one** `<slot />`.
- **Exclusive to Layouts**: Routes and Components cannot use `<slot />`. It is reserved for Layout definition.
- **Exact Replacement**: The `<slot />` element is replaced entirely by the child content. It does not act as a wrapper (it disappears in the output).

## 4. SPA Navigation & Head Immutability
Zenith guarantees a stable `<head>` during client-side navigation.
- **Soft Navigation**: When navigating between pages, the Router:
  1. Fetches the new page HTML.
  2. Extracts the new `<body>` content.
  3. Swaps **ONLY** the Root Container (e.g., `#app`, `#root`, `#main`) or falls back to replacing `document.body` children.
  4. **NEVER** touches `document.head`.
- **Hard Navigation**: If the new page has a different Layout (detected by mismatched structure or missing container), the Router performs a full page load.

## 5. Determinism
Compile outputs are deterministic.
- **Attribute Sorting**: HTML attributes are sorted alphabetically (`class`, `id`, `style`...) to ensure stable builds.
- **Graph Hashing**: Dependency graphs use content-based hashing (SHA-256) independent of file modify times.

## 6. CSS Extraction
(Planned/Implemented)
- CSS is extracted and scoped deterministically.
- `<!-- ZENITH_STYLES_ANCHOR -->` is the precise injection point for critical CSS.
