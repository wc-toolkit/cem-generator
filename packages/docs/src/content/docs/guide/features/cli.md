---
title: CLI
description: Command-line interface for zero-config manifest generation.
---

The `@wc-toolkit/cem-generator-cli` package provides a zero-config command line interface:

```bash
# Basic usage
npx @wc-toolkit/cem-generator-cli generate

# With options
npx @wc-toolkit/cem-generator-cli generate \
  --tsconfig ./tsconfig.lib.json \
  --output ./dist/custom-elements.json \
  --include "src/**/*.ts" \
  --deprecated-last \
  --validate-exported-types error

# Load custom plugins
npx @wc-toolkit/cem-generator-cli generate --plugin ./my-plugin.js
```

## Config file

Create `cem-generator.config.js` in your project root:

```js
export default {
  tsConfigPath: "./tsconfig.lib.json",
  filePath: "./dist/custom-elements.json",
  plugins: [],
  conflictPolicy: "last-wins",
  include: ["src/**/*.ts"],
  sort: true,
  deprecatedLast: true,
};
```

CLI options override config file settings.

`cem init` asks whether to add `customElements` to an existing `package.json`.
The prompt is opt-in and is skipped by `cem init --yes`.

## Options reference

| Option                                 | Alias | Description                                   |
| -------------------------------------- | ----- | --------------------------------------------- |
| `--tsconfig`                           |       | Path to tsconfig.json                         |
| `--config`, `-c`                       |       | Path to config file                           |
| `--output`, `-o`                       |       | Output file path; overrides config `filePath` |
| `--include`                            |       | Glob patterns to include                      |
| `--exclude`                            |       | Glob patterns to exclude                      |
| `--no-inheritance`                     |       | Disable inheritance                           |
| `--plugin`                             |       | Additional plugin paths                       |
| `--conflict-policy`                    |       | `last-wins` or `throw`                        |
| `--no-sort`                            |       | Disable alphabetical sorting                  |
| `--deprecated-last`                    |       | Move deprecated to end                        |
| `--validate-exported-types <severity>` |       | `off`, `warning`, or `error`                  |
| `--validation-invariants <severity>`   |       | Set invariant validation severity             |

The config file's `filePath` controls the default manifest location when
`--output` is omitted.
