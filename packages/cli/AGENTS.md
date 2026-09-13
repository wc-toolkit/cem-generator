# CLI Package Guide

`packages/cli` translates command-line arguments and configuration into the core
generation options, then writes the resulting manifest.

## Start here

- `src/cli.ts`: argument parsing, config loading, generation, and output
- `tests/cli.test.mjs`: CLI contract tests
- `README.md`: supported command and option examples

Keep CLI concerns out of core. When an option changes, update the parser,
its CLI test, and the relevant documentation together. Run `pnpm test:cli` and
`pnpm build` for CLI changes.
