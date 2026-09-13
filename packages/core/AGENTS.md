# Core Package Guide

`packages/core` owns the generation pipeline, public plugin contracts, the shared
TypeScript program, built-in vanilla detection, manifest assembly, inheritance
materialization, and validation.

## Start here

- `src/types.ts`: public options, plugin interfaces, and manifest-facing types
- `src/pipeline.ts`: generation lifecycle, detector execution, merge behavior, and annotators
- `src/program.ts`: TypeScript program creation and source-file selection
- `src/vanilla-builtin.ts`: built-in `HTMLElement` detection
- `src/inheritance-plugin.ts`: post-assembly inheritance materialization
- `tests/`: contract and behavior fixtures

## Rules

- Keep `shouldAnalyze()` cheap and text-based; AST work belongs after selection.
- Preserve the single `ts.Program` per generation run.
- Keep detector fragments isolated until core assembles them.
- Treat annotators as additive-only post-assembly behavior.
- Read the root README's design decisions before changing plugin ordering or merge semantics.
- Add or update a focused test under `tests/` for every behavior change.

Run `pnpm test:core` after core changes. Run `pnpm build` when public types or
project references change.
