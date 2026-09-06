---
title: Conflict Policy
description: How to handle conflicting detector values for the same class field.
---

When multiple detectors claim the same class and produce different values for the same field, you control the behavior:

```ts
const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  detectorConflictPolicy: "throw" // default: throws on conflict
  // or "last-wins" — last plugin's value wins
});
```

## Options

| Policy | Behavior |
|--------|----------|
| `"throw"` | Fail fast with descriptive error (default) |
| `"last-wins"` | Last plugin's value overwrites previous |

## CLI

```bash
cem generate --conflict-policy throw   # default
cem generate --conflict-policy last-wins
```

## Example conflict

```ts
// Plugin A detects: { name: "size", type: "number" }
// Plugin B detects: { name: "size", type: "string" }

// With "throw": Error thrown
// With "last-wins": Plugin B's value wins (depends on plugin order)
```