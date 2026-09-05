---
title: Pipeline
description: How `generateCem()` builds a manifest.
---

`generateCem()` orchestrates analysis and output generation.

## Sequence

1. Optionally accept a tsconfig path (defaults to `./tsconfig.json`) — program creation is handled internally
2. Run built-in vanilla detector plus user-supplied detector plugins per file.
3. Merge detector fragments with conflict handling.
4. Run detector `afterAllFiles` hooks.
5. Run built-in inheritance materialization.
6. Run annotator plugins.
7. Convert internal manifest shape to CEM 2.1.0 package output.

## Conflict and patch behavior

- Detector merge conflicts are controlled by `detectorConflictPolicy`:
  - `throw` (default)
  - `last-wins`
- Additive patch fields:
  - `byDeclaration`
  - `byClassName`
- Controlled replacement patch fields (inheritable arrays only):
  - `replaceByDeclaration`
  - `replaceByClassName`

## Run options

- `plugins?: Plugin[]`
- `detectorConflictPolicy?: "throw" | "last-wins"`
- `inheritance?: false | InheritancePluginOptions`
- `tsConfigPath?: string` — Path to tsconfig.json. Defaults to `./tsconfig.json` if not provided.
- `include?: string[]` — Glob patterns limiting which program files are analyzed. Omit or leave empty to analyze everything. Supports `*`, `**`, `?`, `{a,b}`, `[...]`. A pattern without glob characters matches exactly or as a directory prefix.
- `exclude?: string[]` — Glob patterns removing files from analysis. Exclude wins over include.

```ts
const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  include: ["src/components/**/*.ts"],
  exclude: ["**/*.stories.ts", "**/*.test.ts"],
});
```