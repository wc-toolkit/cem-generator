# cem-gen (working prototype)

A lightweight, plugin-extensible Custom Elements Manifest generator — an
alternative core to `@custom-elements-manifest/analyzer`, built around a
handful of deliberate departures from it.

## Design decisions

- **Disjoint plugins by default, no dependency graph.** A `DetectorPlugin`
  implements `shouldAnalyze(sourceText)` + `onFile(context)` and returns an
  isolated fragment; core merges by class name. No shared mutable
  `context` object, no plugin-to-plugin dependency declarations. This was
  chosen over a wireit-style task graph specifically to avoid making every
  plugin author reason about ordering/coupling for the sake of a minority
  enrichment use case.
- **A separate, additive-only `AnnotatorPlugin` hook** covers the
  enrichment case instead: `afterManifest(manifest)` runs once, read-only,
  after every detector has run, and may only add new fields — the pipeline
  throws if an annotator tries to overwrite a field a detector already set.
- **Vanilla `HTMLElement` detection is built into core, not a plugin.**
  Every project has vanilla components even if it also uses a framework —
  requiring an install for the baseline case added friction with no
  payoff, so `generateCem` always runs it, prepended to whatever plugins
  are supplied. Framework-specific detection (Lit, Stencil, ...) stays
  plugin-based, since those genuinely are opt-in per project.
- **One shared `ts.Program`** built from the project's own `tsconfig.json`
  (respecting `paths`, `include`/`exclude`), reused across every plugin's
  analysis for a run rather than each plugin/file constructing its own.
- **`shouldAnalyze()` is a cheap text check**, not an AST check — it runs before a
  file is even parsed for that plugin, so a project with several installed
  framework plugins doesn't pay full traversal cost per plugin per file.
- **Inheritance resolution is memoized recursion in `afterAllFiles`
  timing, not a dependency graph.** See `packages/core-utils/src/inheritance.ts`
  — a plugin records an unresolved `superclass` reference during `onFile`;
  a shared utility resolves the chain once the full manifest exists,
  correctly handling multi-level inheritance and throwing on circular
  references.
- **Shared logic (JSDoc extraction, inheritance resolution) lives in
  `@wc-toolkit/cem-generator-utils`**, not duplicated per framework plugin — this was
  a specific pain point in the original tool's built-in framework handlers.
- **Library/framework support ships as separate packages**
  (`@wc-toolkit/cem-generator-vanilla`, `@wc-toolkit/cem-generator-lit`, ...), not bundled into
  core, so a project only installs what it needs.

## What's implemented in this prototype

- `packages/core` — types, `ts.Program` construction, the pipeline
  orchestrator (detector execution + merge + annotator pass), and
  **built-in vanilla detection**: `class X extends HTMLElement`,
  `observedAttributes` (both `static get` and `static` field forms),
  `customElements.define()` tag-name mapping, public members, `@fires`
  JSDoc events
- `packages/core-utils` — JSDoc extraction, inheritance resolution
- `packages/bundler-plugin` — Vite/Rollup/Rolldown and Webpack integrations
- `packages/plugins/lit` — an example framework plugin, kept as a
  demonstration of the extension point.
- `packages/plugins/preact` — detects `preact-custom-element` registrations and
  typed Preact component props.
- `packages/plugins/svelte` — detects Svelte components compiled as custom
  elements, including props, slots, parts, styles, and events.
- `examples/` — fixture components and a runnable script showing vanilla
  resolving with zero plugins passed, plus a framework plugin opted in
  via `plugins: [myPlugin()]`

### Generation validation

Generation validates the assembled manifest before returning it. Invariants
are enabled as errors by default and cover schema version, module paths, and
declaration/export references. Exported-type validation is opt-in because
imported types may be intentionally supplied by another package:

```ts
generateCem({
  validation: {
    exportTypes: "error", // "off" | "warning" | "error"
  },
});
```

The CLI equivalent is `cem generate --validate-exported-types error`. Warnings are
reported without failing generation; errors throw `ManifestValidationError`
and therefore also fail bundler builds.

### Inheritance documentation

Inheritance materialization is enabled by default and runs after the complete
manifest has been assembled. It resolves `members`, `attributes`, CSS
properties/parts/states, `slots`, and `events` across multi-level superclass
chains. Inherited entries are marked with `inheritedFrom`; subclass declarations
with the same name take precedence.

Use `inheritance: false` to disable it, or configure `include`/`ignore`, omit
maps, and external manifest lookup through `InheritancePluginOptions`. See the
[inheritance guide](packages/docs/src/content/docs/guide/inheritance.md) for
JSDoc omission tags, output examples, circular-reference behavior, and external
manifest requirements.

Run it:

```sh
pnpm install
pnpm build
pnpm example
```

This writes a manifest file to `examples/custom-elements.json`.

## Documentation site

This repo includes an Astro Starlight docs site in `packages/docs`.

```sh
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

## Package demos

Each package now has an independent `demo/` directory so behavior can be
evaluated in isolation.

- Core demo (vanilla only): `pnpm demo:core`
- Core utils demo (parser output): `pnpm demo:core-utils`
- Example framework plugin demo: `pnpm demo:lit`
- Run all package demos: `pnpm demo:all`

Integration demo remains in `examples/` and runs with `pnpm example`.

## Deliberately not in this prototype

These were discussed and deferred, not forgotten:

- **CEM analyzer plugin compat adapter** — feasible (see conversation), but
  a v2 migration ramp, not a v1 dependency.
- **Emitter plugins** (manifest → `custom-data.json`, `web-types.json`,
  framework wrapper types) — a third plugin category, orthogonal to
  detectors/annotators.
- **Manifest diffing / breaking-change detection**, **monorepo manifest
  merging**, **plugin testing utilities**, **schema validation + vendor
  extension namespace**.
- **Caching/incrementality** (`ts.createIncrementalProgram` / watch APIs) —
  matters for real-scale watch-mode use, not needed to validate the plugin
  contract itself.
- **CSS parts/states inheritance** — deliberately NOT auto-resolved the
  same way as members/attributes, since it isn't guaranteed by the
  prototype chain the way real inheritance is (a subclass that overrides
  `render()` may not actually retain a base class's parts). Left to
  explicit JSDoc (`@part`, `@cssprop`) rather than inferred.

## Known rough edges in this prototype specifically

- Fragment merging in `pipeline.ts` is last-plugin-wins per top-level key
  on conflict — fine for two non-overlapping plugins, but a real v1 needs
  an explicit conflict policy (likely: throw, like the annotator does)
  once more plugins are involved.
- `plugin-vanilla`'s `customElements.define()` detection only handles
  same-file registration; cross-file registration (a separate `index.js`
  that imports and defines components) needs an `afterAllFiles`-level
  pass, not per-file detection.
- No incremental Program reuse yet — every run does a full `ts.Program`
  construction and full traversal.
