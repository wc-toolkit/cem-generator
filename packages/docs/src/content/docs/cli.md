---
title: CLI
description: Use the cem CLI to generate Custom Elements Manifests from the command line.
---

The `@cem-generator/cli` package provides a `cem` command for generating manifests without writing code.

## Install

```bash
npm install -D @cem-generator/cli
```

Or use it directly with `npx`:

```bash
npx @cem-generator/cli generate
```

## Quick Start

```bash
# Generate manifest with defaults (./tsconfig.json -> ./custom-elements.json)
cem generate

# With options
cem generate --config tsconfig.json --output custom-elements.json
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --config <path>` | Path to `tsconfig.json` | `./tsconfig.json` |
| `-o, --output <path>` | Output file path | `./custom-elements.json` |
| `--include <patterns...>` | Glob patterns to include | — |
| `--exclude <patterns...>` | Glob patterns to exclude | — |
| `--no-inheritance` | Disable inheritance materialization | — |
| `--lit` | Enable Lit plugin (`@cem-generator/plugin-lit`) | — |
| `--plugin <paths...>` | Additional plugin paths to load | — |
| `--conflict-policy <policy>` | Detector conflict policy: `throw` \| `last-wins` | `throw` |

## Examples

### Basic usage

```bash
cem generate
```

### Lit project with conflict resolution

When using Lit, both the built-in vanilla detector and Lit plugin may detect the same class members. Use `--conflict-policy last-wins`:

```bash
cem generate --lit --conflict-policy last-wins
```

### Custom include/exclude patterns

```bash
cem generate --include "src/components/**" --exclude "**/*.test.ts"
```

### Disable inheritance

```bash
cem generate --no-inheritance
```

### Load custom plugins

Plugins must be pre-compiled JavaScript files:

```bash
cem generate --plugin ./dist/my-plugin.js
```

## CI/CD Usage

Add to your build scripts:

```json
{
  "scripts": {
    "build:cem": "cem generate --config tsconfig.json --output custom-elements.json --lit --conflict-policy last-wins",
    "prepare": "npm run build:cem"
  }
}
```

## Programmatic API

For advanced use cases, use the core package directly:

```ts
import { generateCem } from "@cem-generator/core";
import { litPlugin } from "@cem-generator/plugin-lit";
import fs from "node:fs";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [litPlugin()],
  detectorConflictPolicy: "last-wins",
});

fs.writeFileSync("custom-elements.json", JSON.stringify(manifest, null, 2));
```

## Next steps

- See [Installation](/installation/) for programmatic usage.
- See [Pipeline](/guide/pipeline/) for `generateCem()` options.
- See [Plugins](/plugins/) for Lit and custom plugin details.