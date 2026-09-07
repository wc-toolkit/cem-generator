---
title: CLI
description: Use the cem CLI to generate Custom Elements Manifests from the command line.
---

The `@wc-toolkit/cem-generator-cli` package provides a `cem` command for generating manifests without writing code.

## Install

```bash
npm install -D @wc-toolkit/cem-generator-cli
```

Or use it directly with `npx`:

```bash
npx @wc-toolkit/cem-generator-cli generate
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
| `--plugin <paths...>` | Additional plugin paths to load | — |
| `--conflict-policy <policy>` | Detector conflict policy: `throw` \| `last-wins` | `last-wins` |

## Examples

### Basic usage

```bash
cem generate
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
    "build:cem": "cem generate --config tsconfig.json --output custom-elements.json",
    "prepare": "npm run build:cem"
  }
}
```

## Programmatic API

For advanced use cases, use the core package directly:

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import fs from "node:fs";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
});

fs.writeFileSync("custom-elements.json", JSON.stringify(manifest, null, 2));
```

## Next steps

- See [Installation](/installation/) for programmatic usage.
- See [Configuration](/guide/configuration/) for `generateCem()` options.
- See [Plugins](/plugins/) for framework and custom plugin details.
