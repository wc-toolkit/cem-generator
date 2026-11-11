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

## Framework detection across custom bases

`shouldAnalyze()` receives text only — no program or type checker — so it cannot
know whether a class extends a framework base through a custom base class. A
component may extend a local base, or import one from another module, with no
framework name in the file at all. Do not narrow the prefilter to a literal
`extends LitElement` (or equivalent): use a broad text check, such as "any
`extends` clause", and let checker-based logic in `onFile()` decide.

Use `inheritsFrom()` from `@wc-toolkit/cem-generator-utils` for that decision
instead of hand-rolling a heritage walk. It follows identifiers, property
accesses, and mixin arguments across files, and stops on cycles:

```ts
import { inheritsFrom } from "@wc-toolkit/cem-generator-utils";

const isLitElement = inheritsFrom(
  node,
  checker,
  ({ expression }) => ts.isIdentifier(expression) && expression.text === "LitElement",
);
```

Return fragments only for classes that pass the check, so a broad prefilter
cannot produce false positives. Add a negative fixture for a subclass of an
unrelated base to lock that behavior in.
