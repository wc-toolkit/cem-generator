---
title: Core API
description: API surface of `@cem-generator/core`.
---

## Primary functions

- `createProgramFromTsConfig(tsConfigPath?: string)` — defaults to `./tsconfig.json`.
- `generateCem(options: RunOptions)` — takes a config object with optional `tsConfigPath`, `include`, `exclude`, `plugins`, `detectorConflictPolicy`, and `inheritance` properties.

## Example

```ts
import { generateCem } from "@cem-generator/core";
import { litPlugin } from "@cem-generator/plugin-lit";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [litPlugin()],
});
```

## `generateCem` options

```ts
type RunOptions = {
  plugins?: Plugin[];
  detectorConflictPolicy?: "throw" | "last-wins";
  inheritance?: false | InheritancePluginOptions;
  tsConfigPath?: string;
  include?: string[];
  exclude?: string[];
};
```

## Inheritance options

```ts
type InheritancePluginOptions = {
  include?: InheritableCollectionKey[];
  ignore?: InheritableCollectionKey[];
  omitByKind?: OmitInheritedMap;
  omitByClassName?: Record<string, OmitInheritedMap>;
  metadataField?: string;
  externalManifests?: unknown[];
  includeExternalManifests?: boolean;
};
```