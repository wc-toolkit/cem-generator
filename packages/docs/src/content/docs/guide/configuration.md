---
title: Configuration
description: All generateCem() options, CLI flags, and config file format.
---

## Config File

cem-generator automatically loads configuration from a `cem-generator.config.{js,mjs,cjs,ts}` file in the current working directory (or a custom path via `--cem-config`).

```js
// cem-generator.config.mjs
// Load this object from a custom-elements.json file before configuration.
const externalCem = loadManifest("./other-manifest.json");

export default {
  // Optional: glob patterns limiting analyzed files
  include: ["src/components/**/*.ts"],
  // Optional: glob patterns removing files from analysis
  exclude: ["**/*.stories.ts", "**/*.test.ts"],
  // Optional: how to handle detector conflicts
  conflictPolicy: "last-wins",
  // Optional: inheritance materialization
  inheritance: {
    externalManifests: [externalCem],
  },
};
```

### Supported Config File Names

| Filename | Description |
|----------|-------------|
| `cem-generator.config.mjs` | ES Module (recommended) |
| `cem-generator.config.js` | CommonJS / ES Module |
| `cem-generator.config.cjs` | Explicit CommonJS |
| `cem-generator.config.ts` | TypeScript (requires `tsx` installed) |

**Priority order**: The first matching file found is used (in the order above).

### TypeScript Config Files

To use a `.ts` config file, install `tsx`:

```bash
npm install --save-dev tsx
```

The config file can use TypeScript syntax and import types from `@wc-toolkit/cem-generator`:

```ts
// cem-generator.config.ts
import type { RunOptions } from "@wc-toolkit/cem-generator";

export default {
  include: ["src/**/*.ts"],
  exclude: ["**/*.test.ts"],
  conflictPolicy: "last-wins",
} satisfies RunOptions;
```

## generateCem() Options

```ts
import { generateCem } from "@wc-toolkit/cem-generator";

const manifest = generateCem({
  // Optional: defaults to ./tsconfig.json
  tsConfigPath: "./tsconfig.json",

  // Optional: additional plugins beyond built-in vanilla detector
  plugins: [myPlugin()],

  // Optional: how to handle detector conflicts
  // "throw" | "last-wins" (default)
  conflictPolicy: "last-wins",

  // Optional: inheritance materialization
  // false to disable, or an options object. Manifests must be loaded objects.
  inheritance: {
    externalManifests: [externalCem],
  },

  // Optional: file filtering
  include: ["src/components/**/*.ts"],
  exclude: ["**/*.stories.ts", "**/*.test.ts"],

  // Optional: validate the completed manifest during generation
  validation: {
    invariants: "error",
    exportTypes: "error",
  },
});
```

### Option Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tsConfigPath` | `string` | `"./tsconfig.json"` | Path to TypeScript config. Program created from this config. |
| `plugins` | `Plugin[]` | `[]` | Additional detector/annotator plugins. Vanilla detector always runs. |
| `conflictPolicy` | `"throw" \| "last-wins"` | `"last-wins"` | How to resolve when multiple detectors produce different values for same class field. |
| `inheritance` | `false \| InheritancePluginOptions` | `{}` | Built-in inheritance materialization. Set `false` to disable. |
| `include` | `string[]` | `undefined` | Glob patterns limiting analyzed files. Omit for all non-declaration, non-node_modules files. |
| `exclude` | `string[]` | `undefined` | Glob patterns removing files from analysis. Exclude wins over include. |
| `validation` | `ManifestValidationOptions` | `{ invariants: "error", exportTypes: "off" }` | Validate generated manifest invariants and public type exports. |

## Inheritance Options

`externalManifests` takes parsed manifest objects. The generator does not read
paths or fetch URLs itself:

```js
import { readFileSync } from "node:fs";

const externalCem = JSON.parse(
  readFileSync("./node_modules/@acme/components/custom-elements.json", "utf8")
);
```

```ts
inheritance: {
  // Restrict which collection kinds are materialized
  include: ["members", "attributes", "events"],

  // Omit inherited items by kind, class name, or a custom metadata field
  omitByKind: {
    members: ["internalMethod"],
    attributes: ["deprecated-attr"],
  },

  // External manifests used to resolve inherited superclass APIs
  externalManifests: [externalCem],

  // Also append eligible external custom-element declarations to output
  includeExternalManifests: false,
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `include` / `ignore` | `InheritableCollectionKey[]` | all keys | Restrict which collection kinds are inherited. |
| `omitByKind` | `OmitInheritedMap` | — | Names of inherited items to omit, per collection kind. |
| `omitByClassName` | `Record<string, OmitInheritedMap>` | — | Per-superclass-class omission maps. |
| `metadataField` | `string` | `"omitInherited"` | Manifest field each class exposes its omit map on. |
| `externalManifests` | `unknown[]` | `[]` | Loaded CEM manifest objects used to resolve inherited superclass APIs. |
| `includeExternalManifests` | `boolean` | `false` | Also append external declarations with `customElement: true` or `tagName` to output. |

`includeExternalManifests` does not control whether inheritance is resolved. A
manifest can be used for lookup while remaining absent from output. Conversely,
setting it to `true` has no effect unless the manifest is supplied through
`externalManifests`.

## File Filtering (include/exclude)

Glob patterns are matched against:
- Absolute file path
- Path relative to `process.cwd()`
- Path relative to tsconfig directory
- Basename

Supported: `*`, `**`, `?`, `{a,b}`, `[...]`

```ts
include: ["src/components/**"]  // Everything under src/components/
exclude: ["**/*.test.ts", "**/*.stories.ts"]
```

## CLI Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--tsconfig <path>` | tsconfig.json path | `./tsconfig.json` |
| `-c, --config <path>` | cem-generator config file path (auto-detected if omitted) | — |
| `-o, --output <path>` | Output file | `./custom-elements.json` |
| `--include <patterns...>` | Include globs | — |
| `--exclude <patterns...>` | Exclude globs | — |
| `--no-inheritance` | Disable inheritance | — |
| `--plugin <paths...>` | Custom plugin paths | — |
| `--conflict-policy <policy>` | `throw` \| `last-wins` | `last-wins` |
| `--validate-exported-types <severity>` | `off` \| `warning` \| `error` | — |
| `--validation-invariants <severity>` | `off` \| `warning` \| `error` | `error` |

```bash
cem generate \
  --tsconfig tsconfig.lib.json \
  --output dist/custom-elements.json \
  --include "src/**" \
  --exclude "**/*.test.ts" \
  --conflict-policy last-wins
```

## Config File + CLI Merging

When both a config file and CLI flags are provided, they are merged with **CLI flags taking precedence**:

- Single-value options (e.g., `tsConfigPath`, `conflictPolicy`): CLI value wins
- Array options (e.g., `plugins`, `include`, `exclude`): CLI values are appended to config file values
- Object options (e.g., `inheritance`): Deep merged, CLI properties override config file properties

```bash
# Uses config file's include + CLI's additional include
cem generate --include "src/extra/**"
```

## TypeScript Configuration

Ensure your `tsconfig.json` includes source files and enables `checkJs` for JSDoc in `.js` files:

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "declaration": true,
    "moduleResolution": "bundler"
  },
  "include": ["src/**/*"]
}
```

## Next steps

- [Overview](/guide/overview/) — Getting started
- [Documenting](/guide/documenting/) — JSDoc tags reference
- [Plugins](/plugins/) — Internal architecture and plugin layers
