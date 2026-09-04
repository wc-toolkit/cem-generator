# @cem-generator/core

Core engine package for developers and agents building CEM analysis flows.

## Who should use this

- Tooling developers building custom manifest generation workflows
- Plugin authors implementing detector or annotator plugins
- Agents automating source analysis over TypeScript projects

## What this package does

- Builds a shared `ts.Program` from a project's `tsconfig.json`
- Runs detector plugins per source file and merges fragments by class name
- Runs annotator plugins after manifest assembly with additive-only enforcement
- Includes built-in vanilla `HTMLElement` detection (always on)
- Re-exports shared helpers from `@cem-generator/core-utils`

## Plugin lifecycle

- `claims(sourceText, filePath)` runs once per detector per file as a cheap prefilter
- `onFile(context)` runs for claimed files and returns class fragments
- `afterFile(context, classFragment)` runs after per-file fragment merge
- `afterAllFiles(manifest)` runs once for cross-file detector enrichment with additive-only patch semantics
- Annotators run after detectors and are also additive-only

## Main exports

- `runPipeline`
- `buildProgramFromTsconfig`
- `vanillaBuiltin`
- Types from `./types`
- Utility re-exports: `resolveInheritedCollection`, `getJSDocInfo`, `getJSDocTagsNamed`

## Integration pattern

```ts
import { createProgramFromTsConfig, runPipeline } from "@cem-generator/core";
import { litPlugin } from "@cem-generator/plugin-lit";

const program = createProgramFromTsConfig("./tsconfig.json");

const manifest = runPipeline(program, {
  plugins: [litPlugin()],
  detectorConflictPolicy: "throw", // default
});
```

## Agent notes

- Treat detector `claims()` as a fast prefilter and keep it text-cheap.
- Keep detector output isolated to its own fragment; avoid cross-plugin coupling.
- Additive enrichment belongs in annotators, not detectors.
- Use detector `afterAllFiles` only for cross-file detection that still belongs to detector logic.
- Resolve inheritance after full manifest assembly using shared utils.

## Cross-file detector example

- See `examples/plugins/define-registration-plugin.ts` for a minimal `afterAllFiles` pattern that collects `customElements.define()` calls and writes `tagName` via `byDeclaration` patch keys.

## Demo

- Run `pnpm --filter @cem-generator/core demo`
- Input fixtures live in `packages/core/demo/fixtures/` and include both JS and TS examples.
- Output manifest is written to `packages/core/demo/custom-elements.json`.
