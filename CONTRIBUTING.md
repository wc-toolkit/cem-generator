# Contributing

This repo is a TypeScript monorepo managed with workspace packages under `packages/*`.

## Prerequisites

- Node.js 20+
- `pnpm` (preferred) or `npm`

## Install

Using pnpm:

```sh
pnpm install
```

Using npm:

```sh
npm install
```

## Run locally

Build all packages (TypeScript project references):

```sh
pnpm build
```

or

```sh
npm run build
```

Run the example pipeline:

```sh
pnpm example
```

or

```sh
npm run example
```

Run package demos independently:

```sh
pnpm demo:core
pnpm demo:core-utils
pnpm demo:lit
```

Or run all package demos:

```sh
pnpm demo:all
```

## Test

Run contract tests:

```sh
pnpm test
```

This runs:

- `pnpm build`
- package-level tests via `pnpm -r --filter './packages/**' --if-present test`

Current package tests:

- `packages/core/tests/pipeline-contracts.test.mjs`
- `packages/core/tests/jsdoc-supported-tags.test.mjs`

Use the example run as an additional smoke check after major changes.

## Workspace tips

- Workspace packages:
  - `@cem-generator/core-utils`
  - `@cem-generator/core`
  - `@cem-generator/plugin-lit`
- Root `tsconfig.json` uses project references; package `tsconfig.json` files participate in the root build.

## Contribution workflow

1. Create a focused branch.
2. Make small, reviewable commits.
3. Run build and smoke-check example locally.
4. Update docs when behavior or contracts change (root README and package READMEs).
5. Open a PR with:
   - What changed
   - Why it changed
   - How you validated it

## Plugin contribution guidance

- Keep detector `claims()` checks cheap and text-based.
- Keep detector output isolated; avoid cross-plugin coupling.
- Use detector `afterAllFiles` for cross-file detector enrichment.
- Use annotators for additive post-assembly metadata only.
- Reuse shared helpers from `@cem-generator/core-utils` instead of duplicating logic.
