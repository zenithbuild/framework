# @zenithbuild/compiler v0.6.0

## Summary

- JSON output now includes versioned `schemaVersion: 1` and `warnings` array for LSP integration
- New stdin compile mode: `compile(source, filePath)` for unsaved/in-memory validation
- ZEN-DOM-* warnings surfaced in JSON with stable shape (`code`, `message`, `severity`, `range`)

## Breaking Changes

None. `compile(filePath)` continues to work. New fields are additive.

## Key Changes

- **JSON contract:** Added `schemaVersion: 1` for LSP branching; `warnings` array always present (empty or populated)
- **Stdin mode:** `compile(source, filePath)` and `compile({ source, filePath })` pipe source to CLI `--stdin`
- **Warning shape:** Each warning has `code`, `message`, `severity`, `range.start`, `range.end`
- **Bridge tests:** JSON schema contract tests added to prevent regressions

## Verification Checklist

- [ ] `node -e "const c=require('./dist/index.js'); const r=c.compile('test.zen'); console.log(r.schemaVersion, r.warnings)"` shows `1` and array
- [ ] `cargo test` and `node --test tests/bridge-lock.spec.js` pass
