---
title: File Filtering
description: Limit which source files are analyzed using glob patterns.
---

Limit which source files are analyzed using glob patterns:

```ts
const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  include: ["src/components/**/*.ts"],  // only analyze these
  exclude: ["**/*.test.ts", "**/*.spec.ts"] // but not these
});
```

## CLI

```bash
cem generate --include "src/components/**/*.ts" --exclude "**/*.test.ts"
```

## Pattern matching

Patterns match against:
- Absolute file path
- Path relative to `process.cwd()`
- Path relative to tsconfig directory
- File basename

Supports `*`, `**`, `?`, `{a,b}`, `[...]`.

## Priority

1. If `include` is set, only files matching `include` are analyzed
2. Files matching `exclude` are always removed
3. `exclude` wins over `include`