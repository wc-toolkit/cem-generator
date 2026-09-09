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

Set up a project configuration interactively, then generate the manifest:

```bash
cem init
cem generate
```

`cem init` creates `cem-generator.config.mjs` and prompts you to select any
framework plugins your project uses. Vanilla custom elements are supported by
the generator without an additional plugin.

After plugin selection, the interactive flow asks whether to install the
selected plugin packages. It detects `pnpm`, `yarn`, `bun`, or `npm` from the
project lockfile.

For a non-interactive CLI setup, pass the mode and plugin names directly:

```bash
cem init --mode cli --plugin lit svelte
```

Add `--install` to install selected packages in a scripted setup:

```bash
cem init --mode cli --plugin lit svelte --install
```

The selected plugin packages must be installed in the project. For example:

```bash
npm install -D @wc-toolkit/cem-generator-lit @wc-toolkit/cem-generator-svelte
```

The generated config imports and enables the selected plugins:

```js
import { litPlugin } from "@wc-toolkit/cem-generator-lit";

export default {
  plugins: [litPlugin()],
};
```

Use `cem init --mode cli --yes` to create a vanilla-only config without
prompting. An existing config is not overwritten unless `--force` is provided.
Use `--config <path>` to write the config to a different location.

To use the generator from code instead, choose code when prompted or run:

```bash
cem init --mode code --plugin lit
```

This creates both `cem-generator.config.mjs` and `generate-cem.ts`. The
generated script imports the shared config, calls `generateCem()`, and writes
`custom-elements.json`. Run it with `tsx generate-cem.ts`.

## Initialize a project

Available plugin names are `lit`, `fast`, `stencil`, `preact`, `vue`, `solid`,
and `svelte`.

| Command | Description |
|---------|-------------|
| `cem init` | Prompt for framework plugins and create `cem-generator.config.mjs` |
| `cem init --mode cli --plugin lit vue` | Create a config with selected plugins |
| `cem init --mode code --plugin lit` | Create a code-based `generate-cem.ts` workflow |
| `cem init --mode cli --yes` | Create a vanilla-only config without prompting |
| `cem init --mode cli --plugin lit --install` | Create a config and install selected plugins |
| `cem init --force` | Overwrite an existing output file |
| `cem init --config ./config/cem.mjs` | Write a CLI config to a custom path |

## Generate a manifest

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

const manifest = generateCem();

fs.writeFileSync("custom-elements.json", JSON.stringify(manifest, null, 2));
```

## Next steps

- See [Installation](/installation/) for programmatic usage.
- See [Configuration](/guide/configuration/) for `generateCem()` options.
- See [Plugins](/plugins/) for framework and custom plugin details.
