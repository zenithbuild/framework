# Zenith Determinism Contract

This document defines the strict determinism guarantees provided by the Zenith compiler and bundler.
These invariants are enforced by the build pipeline and must not be violated.

## 1. CSS Output Determinism

The CSS output is a **pure function** of the canonical module graph and normalized source content.
It is guaranteed to be byte-stable across environments (OS, CI, local).

### Invariants:

1.  **Topological Ordering**:
    Styles are ordered by **dependency depth** (reverse topological sort).
    If `A` imports `B`, and `B` imports `C`, the CSS order is guaranteed to be:
    ```
    [C styles]
    [B styles]
    [A styles]
    ```
    This ensures that parent components (`A`) can always override styles of their dependencies (`B`).

2.  **Byte-Stability**:
    - All line endings are normalized to `\n` (LF) before hashing and concatenation.
    - `\r\n` (CRLF) is strictly forbidden in the final output.
    - UTF-8 encoding is enforced.

3.  **Strict Anchor Enforcement**:
    The HTML template **must** contain exactly one `<!-- ZENITH_STYLES_ANCHOR -->`.
    The bundler will **hard-fail** if:
    - The anchor is missing.
    - Multiple anchors are present.
    - The anchor is malformed.
    This ensures CSS injection is explicit and never accidental.

4.  **No Hidden Mutation**:
    The CSS bundle is constructed via simple concatenation of topologically sorted blocks.
    - **Duplicate (module_id, order) pairs hard-fail**: The compiler ensures uniqueness of identity.
    - **Duplicate content preserved**: If two different modules emit identical CSS, both are included.
    - No reordering based on specificity or file names.
    - No implicit optimization or minification in the extraction phase.

## 2. Compiler Determinism

1.  **Canonical Module IDs**:
    - All module IDs are normalized to forward slashes (`/`), regardless of OS.
    - Relative imports are resolved relative to the *canonical* path of the importer.
    - This ensures `sha256` hashes of module graphs are identical on Windows, macOS, and Linux.

2.  **Expression Stability**:
    - Expression extraction order is determinstic (left-to-right, depth-first).
    - `__zenith_expr` array order matches the source appearance exactly.

## 3. Runtime Parity

1.  **Unified Pipeline**:
    - `zenith dev` uses the **exact same** `zenith-bundler` binary and pipeline as `zenith build`.
    - No "fast path" or "in-memory only" bypasses that skip the determinism checks.
    - CSS in `dev` mode is identical to `prod` (excluding optional minification).

2.  **Virtual Modules**:
    - `zenith:css:<page>` and `zenith:entry:<page>` virtual modules are sealed.
    - User code cannot mock or override these internal modules.
