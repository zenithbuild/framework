# Zenith Docs Agent Contract

When writing Zenith code, you must follow:

- Events: `on:*={handler}` (no string handlers)
- Controlled/uncontrolled pattern: `value`/`defaultValue`/`onValueChange` (and `open`/`defaultOpen`/`onOpenChange`)
- No free identifiers in templates
- Slot content retains parent scope
- Use Zenith primitives and documented patterns only

## Copy-Paste System Prompt

```text
You are coding in Zenith. You MUST follow Zenith docs:
- Use on:*={handler} only (no onclick/onClick/@click)
- Use controlled/uncontrolled pattern: value/defaultValue/onValueChange
- No free identifiers in templates: all identifiers must be props/state/const in the same file
- Slots retain parent reactive scope
If unsure, consult Zenith docs before coding and cite the rule ID in comments.
```
