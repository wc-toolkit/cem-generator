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
cem generate --tsconfig ./tsconfig.json --output ./custom-elements.json

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
also asks whether to add the generated manifest to `package.json` as the
`customElements` property. It supports `--plugin <names...>`,
`--yes`, `--force`, and `--config <path>`.

When accepted, the package.json property uses the default manifest path:

```json
{
  "customElements": "custom-elements.json"
}
```

Use `filePath` in the config when the manifest belongs in a build directory.

`cem generate` uses source-oriented include/exclude defaults when those flags
are omitted. Supplying either flag replaces its defaults. The TypeScript
configuration still controls which files enter the program.

The config file may set `filePath` to choose the generated manifest path. The
`--output` flag takes precedence when supplied.

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
| `--tsconfig <path>` | Path to tsconfig.json | `./tsconfig.json` |
| `-c, --config <path>` | Path to the generator config file | auto-detected |
| `-o, --output <path>` | Output file path | `./custom-elements.json` |
| `--include <patterns...>` | Glob patterns to include | `src/**/*.{ts,tsx,js,jsx}` when `src/` exists |
| `--exclude <patterns...>` | Glob patterns to exclude | Tests, specs, stories, `dist/`, and `node_modules/` |
| `--no-inheritance` | Disable inheritance materialization | - |
| `--plugin <paths...>` | Additional plugin paths to load | - |
| `--conflict-policy <policy>` | Detector conflict policy: `throw` \| `last-wins` | `last-wins` |

The config file may set `filePath` for the manifest path. The `--output` flag
takes precedence over `filePath`.

## Example

```bash
# Basic manifest generation
cem generate --tsconfig tsconfig.json --output custom-elements.json
```
