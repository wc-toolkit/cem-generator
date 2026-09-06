---
title: Alphabetical Sorting
description: Sort manifest entries alphabetically for consistent, deterministic output.
---

The manifest can be sorted alphabetically for consistent, predictable output. This makes diffs cleaner and output deterministic.

## Options

```ts
const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  sort: true,            // default: true
  deprecatedLast: true   // default: true
});
```

## CLI

```bash
# Sorting enabled by default
cem generate

# Disable sorting
cem generate --no-sort

# Move deprecated items to end of each list
cem generate --deprecated-last
```

## What gets sorted

- **Modules** — by file path
- **Declarations** — by name
- **Exports** — by name
- **Members** — by name
- **Attributes** — by name
- **Events** — by name
- **Slots** — by name
- **CSS Properties** — by name
- **CSS Parts** — by name
- **CSS States** — by name

## Deprecated last

When `deprecatedLast: true`, items with `@deprecated` are grouped at the end of their respective lists while maintaining alphabetical order within each group:

```json
{
  "members": [
    { "name": "activeMethod" },
    { "name": "regularField" },
    { "name": "deprecatedMethod", "deprecated": "Use activeMethod instead" },
    { "name": "oldField", "deprecated": true }
  ]
}
```