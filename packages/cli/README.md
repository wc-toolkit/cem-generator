# @wc-toolkit/cem-generator-cli

CLI tool for generating Custom Elements Manifests.

## Installation

```bash
pnpm add -w @wc-toolkit/cem-generator-cli
```

## Usage

```bash
# Create a config and choose parser plugins and integrations interactively
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

`cem init` writes `cem-generator.config.mjs`. In interactive mode it first asks
which parser plugins to use, then presents a multi-select list of integrations:
`react-wrappers`, `jsx-types`, `vuejs-types`, and `svelte-types`. The type
integrations use `./types` and strongly typed events by default. The command
also supports `--plugin <names...>`,
`--yes`, `--force`, and `--config <path>`.

`cem generate` uses source-oriented include/exclude defaults when those flags
are omitted. Supplying either flag replaces its defaults. The TypeScript
configuration still controls which files enter the program.

When `cem init` installs dependencies, CLI mode installs
`@wc-toolkit/cem-generator-cli`, while code mode installs
`@wc-toolkit/cem-generator` and `tsx`. Selected parser and integration
packages are installed alongside the workflow package. The command prints the
`package.json` script to add and the package-manager command to run it.

In an interactive terminal, use the arrow keys to move through lists, Space to
toggle checkbox selections, and Enter to confirm. Non-interactive input falls
back to comma-separated selection numbers.

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --config <path>` | Path to tsconfig.json | `./tsconfig.json` |
| `-o, --output <path>` | Output file path | `./custom-elements.json` |
| `--include <patterns...>` | Glob patterns to include | `src/**/*.{ts,tsx,js,jsx}` when `src/` exists |
| `--exclude <patterns...>` | Glob patterns to exclude | Tests, specs, stories, `dist/`, and `node_modules/` |
| `--no-inheritance` | Disable inheritance materialization | - |
| `--plugin <paths...>` | Additional plugin paths to load | - |
| `--conflict-policy <policy>` | Detector conflict policy: `throw` \| `last-wins` | `last-wins` |

## Example

```bash
# Basic manifest generation
cem generate --config tsconfig.json --output custom-elements.json
```
