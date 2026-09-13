# Architecture Index

This page is a navigation aid for contributors and AI tools. Source code and
tests are authoritative; this page should stay short and link to the seam where
behavior is implemented.

## Package relationships

```text
                    +----------------------+
                    | packages/docs        |
                    | Astro documentation  |
                    +----------+-----------+
                               |
                               v
+----------------+     +-------+--------+     +----------------------+
| framework      | --> | packages/core | <-- | packages/cli          |
| plugins        |     | generation    |     | command-line adapter  |
+-------+--------+     +---+--------+---+     +----------------------+
        |                  |        |
        v                  v        v
 +------+---------+  +-----+--+  +--+----------------+
 | core-utils     |  | CEM    |  | bundler-plugin    |
 | shared parsing |  | output |  | build adapters    |
 +----------------+  +--------+  +-------------------+
```

Framework plugins and the CLI depend on core contracts. Core uses
`core-utils` for shared parsing and inheritance logic. Bundler adapters invoke
the same core generation behavior from build-tool hooks.

## Generation lifecycle

The main implementation is `packages/core/src/pipeline.ts`.

1. Load options and build one TypeScript `Program` from the project's config.
2. Run built-in vanilla detection and opted-in detector plugins per source file.
3. Each detector returns an isolated manifest fragment.
4. Run detector `afterAllFiles` hooks for cross-file enrichment.
5. Merge fragments into the manifest according to the current conflict policy.
6. Materialize inheritance and run additive-only annotators.
7. Validate the assembled manifest and return or emit it.

The public contracts for this lifecycle live in `packages/core/src/types.ts`.

## Behavior map

| Behavior | Implementation | Tests |
| --- | --- | --- |
| Pipeline lifecycle and fragment assembly | `packages/core/src/pipeline.ts` | `packages/core/tests/pipeline-contracts.test.mjs` |
| TypeScript program and include/exclude handling | `packages/core/src/program.ts` | `packages/core/tests/include-exclude.test.mjs` |
| Config loading | `packages/core/src/config-loader.ts` | `packages/core/tests/config-loader.test.mjs` |
| Vanilla custom element detection | `packages/core/src/vanilla-builtin.ts` | Core fixture tests |
| Inheritance materialization | `packages/core/src/inheritance-plugin.ts`, `packages/core-utils/src/inheritance.ts` | `packages/core/tests/inheritance-omit.test.mjs` |
| JSDoc tags and metadata | `packages/core-utils/src/jsdoc.ts` | `packages/core/tests/jsdoc-supported-tags.test.mjs` |
| Export and manifest validation | `packages/core/src/validation.ts` | `packages/core/tests/exports.test.mjs` |
| CLI options and output | `packages/cli/src/cli.ts` | `packages/cli/tests/cli.test.mjs` |
| Bundler lifecycle adapters | `packages/bundler-plugin/src/` | `packages/bundler-plugin/tests/shared.test.mjs` |
| Framework-specific detection | `packages/plugins/<framework>/src/index.ts` | Matching plugin `tests/` directory |

## Known intentional behavior

- Detector fragments currently merge with last-plugin-wins behavior for top-level conflicts.
- Vanilla registration detection is same-file only; cross-file registration requires a later cross-file pass.
- A fresh TypeScript `Program` is constructed for each generation run; incremental reuse is deferred.

When changing one of these behaviors, update the root README and the relevant
contract tests so the decision remains visible.
