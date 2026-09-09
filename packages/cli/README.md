# @wc-toolkit/cem-generator-cli

CLI tool for generating Custom Elements Manifests.

## Installation

```bash
pnpm add -w @wc-toolkit/cem-generator-cli
```

## Usage

```bash
# Create a config and choose framework plugins interactively
cem init

# Create a config with selected plugins without prompting
cem init --plugin lit svelte

# Generate manifest using tsconfig.json in current directory
cem generate

# Specify custom tsconfig and output path
cem generate --config ./tsconfig.json --output ./custom-elements.json

# Include/exclude specific files
cem generate --include "src/components/**" --exclude "**/*.test.ts"

# Use custom plugins
cem generate --plugin ./my-plugin.js

# Disable inheritance materialization
cem generate --no-inheritance
```

## Options

`cem init` writes `cem-generator.config.mjs` and supports `--plugin <names...>`,
`--yes`, `--force`, and `--config <path>`.

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --config <path>` | Path to tsconfig.json | `./tsconfig.json` |
| `-o, --output <path>` | Output file path | `./custom-elements.json` |
| `--include <patterns...>` | Glob patterns to include | - |
| `--exclude <patterns...>` | Glob patterns to exclude | - |
| `--no-inheritance` | Disable inheritance materialization | - |
| `--plugin <paths...>` | Additional plugin paths to load | - |
| `--conflict-policy <policy>` | Detector conflict policy: `throw` \| `last-wins` | `last-wins` |

## Example

```bash
# Basic manifest generation
cem generate --config tsconfig.json --output custom-elements.json
```
