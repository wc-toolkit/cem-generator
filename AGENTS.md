# AI Contribution Guide

This is a pnpm TypeScript monorepo. Keep investigations narrow: start with the
package named by the task, read its local `AGENTS.md`, then inspect only the
source and tests involved in the behavior.

## Repository map

| Area | Start here | Tests / validation |
| --- | --- | --- |
| Generation pipeline and public contracts | `packages/core/src/pipeline.ts`, `types.ts` | `pnpm test:core` |
| TypeScript programs and config | `packages/core/src/program.ts`, `config-loader.ts` | `pnpm test:core` |
| Shared JSDoc, type, and inheritance logic | `packages/core-utils/src/` | Validate through `pnpm test:core`; package has no isolated test suite yet |
| CLI behavior | `packages/cli/src/cli.ts` | `pnpm test:cli` |
| Vite/Webpack integrations | `packages/bundler-plugin/src/` | `pnpm test:bundler` |
| Framework detection | `packages/plugins/<framework>/src/index.ts` | `pnpm test:plugins` or the package test script |
| User-facing documentation | `packages/docs/src/content/docs/` | `pnpm docs:build` |

The package-local guides contain more specific rules for each area. `docs/architecture.md`
describes the lifecycle and package relationships without replacing source code or
tests as the authority.

## Change rules

- Prefer the smallest package-local change that preserves the public contract.
- Read `packages/core/src/types.ts` before changing plugin interfaces or manifest shapes.
- Read `packages/core/src/pipeline.ts` before changing plugin ordering, merging, or lifecycle behavior.
- Update the nearest contract or fixture test when behavior changes.
- Treat `custom-elements.json`, `dist/`, `.astro/`, `node_modules/`, and `*.tsbuildinfo` as generated output, not source.
- Do not edit generated output to fix a source behavior.
- Update package or docs guidance only when the public behavior or workflow changes.

## Validation

Use the narrowest command that covers the change:

```sh
pnpm test:core
pnpm test:cli
pnpm test:bundler
pnpm test:plugins
pnpm build
pnpm docs:build
```

Run `pnpm test` for a cross-package change or before a release-oriented review.
