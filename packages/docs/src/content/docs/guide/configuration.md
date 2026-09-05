---
title: Configuration
description: All generateCem() options, CLI flags, and config file format.
---

## Config File

cem-generator automatically loads configuration from a `cem-generator.config.{js,mjs,cjs,ts}` file in the current working directory (or a custom path via `--cem-config`).

```js
// cem-generator.config.mjs
export default {
  // Optional: glob patterns limiting analyzed files
  include: ["src/components/**/*.ts"],
  // Optional: glob patterns removing files from analysis
  exclude: ["**/*.stories.ts", "**/*.test.ts"],
  // Optional: how to handle detector conflicts
  detectorConflictPolicy: "last-wins",
  // Optional: inheritance materialization
  inheritance: {
    omitInherited: true,
    externalManifests: ["./other-manifest.json"],
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

The config file can use TypeScript syntax and import types from `@cem-generator/core`:

```ts
// cem-generator.config.ts
import type { RunOptions } from "@cem-generator/core";

export default {
  include: ["src/**/*.ts"],
  exclude: ["**/*.test.ts"],
  detectorConflictPolicy: "last-wins",
} satisfies RunOptions;
```

## generateCem() Options

```ts
import { generateCem } from "@cem-generator/core";

const manifest = generateCem({
  // Required: path to tsconfig.json
  tsConfigPath: "./tsconfig.json",

  // Optional: additional plugins beyond built-in vanilla detector
  plugins: [litPlugin()],

  // Optional: how to handle detector conflicts
  // "throw" (default) | "last-wins"
  detectorConflictPolicy: "last-wins",

  // Optional: inheritance materialization
  // false to disable, or options object
  inheritance: {
    omitInherited: true,
    externalManifests: ["./other-manifest.json"],
  },

  // Optional: file filtering
  include: ["src/components/**/*.ts"],
  exclude: ["**/*.stories.ts", "**/*.test.ts"],
});
```

### Option Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tsConfigPath` | `string` | `"./tsconfig.json"` | Path to TypeScript config. Program created from this config. |
| `plugins` | `Plugin[]` | `[]` | Additional detector/annotator plugins. Vanilla detector always runs. |
| `detectorConflictPolicy` | `"throw" \| "last-wins"` | `"throw"` | How to resolve when multiple detectors produce different values for same class field. |
| `inheritance` | `false \| InheritancePluginOptions` | `{}` | Built-in inheritance materialization. Set `false` to disable. |
| `include` | `string[]` | `undefined` | Glob patterns limiting analyzed files. Omit for all non-declaration, non-node_modules files. |
| `exclude` | `string[]` | `undefined` | Glob patterns removing files from analysis. Exclude wins over include. |

## Inheritance Options

```ts
inheritance: {
  // Omit inherited members from class metadata (keeps only locally-defined)
  omitInherited: true,

  // External manifests to resolve superclass from
  externalManifests: [
    "./node_modules/some-lib/custom-elements.json",
    "https://cdn.example.com/manifest.json",
  ],

  // Include external manifest declarations in output
  includeExternalManifests: true,
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `omitInherited` | `boolean` | `false` | When true, omits inherited APIs from output (controlled via `@omitInherited` JSDoc tag on superclass). |
| `externalManifests` | `string[]` | `[]` | Paths/URLs to external CEM files for resolving inherited superclass APIs. |
| `includeExternalManifests` | `boolean` | `false` | Whether to include external manifest declarations in output. |

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
| `-c, --config <path>` | tsconfig.json path | `./tsconfig.json` |
| `--cem-config <path>` | cem-generator config file path (auto-detected if omitted) | — |
| `-o, --output <path>` | Output file | `./custom-elements.json` |
| `--include <patterns...>` | Include globs | — |
| `--exclude <patterns...>` | Exclude globs | — |
| `--no-inheritance` | Disable inheritance | — |
| `--lit` | Enable Lit plugin | — |
| `--plugin <paths...>` | Custom plugin paths | — |
| `--conflict-policy <policy>` | `throw` \| `last-wins` | `throw` |

```bash
cem generate \
  --config tsconfig.lib.json \
  --output dist/custom-elements.json \
  --include "src/**" \
  --exclude "**/*.test.ts" \
  --lit \
  --conflict-policy last-wins
```

## Config File + CLI Merging

When both a config file and CLI flags are provided, they are merged with **CLI flags taking precedence**:

- Single-value options (e.g., `tsConfigPath`, `detectorConflictPolicy`): CLI value wins
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
- [Pipeline](/guide/pipeline/) — Internal architecture