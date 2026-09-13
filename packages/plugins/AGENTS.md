# Framework Plugin Guide

Each directory under `packages/plugins` is an independent detector package. A
plugin should identify only its framework's conventions and return isolated
manifest fragments for core to assemble.

## Start here

- `<framework>/src/index.ts`: detector and public export
- `<framework>/tests/`: behavior tests and fixtures
- `<framework>/README.md`: supported framework conventions and limitations
- `packages/core/src/types.ts`: plugin and manifest contracts

Keep `shouldAnalyze()` cheap, avoid plugin-to-plugin coupling, and use shared
helpers from `@wc-toolkit/cem-generator-utils`. Use `afterAllFiles` only for
cross-file enrichment that cannot be determined in `onFile`. Run the focused
package test first, then `pnpm test:plugins` for changes shared across plugins.
