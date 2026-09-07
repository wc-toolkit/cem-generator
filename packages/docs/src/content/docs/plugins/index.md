---
title: Plugins
description: Extending cem-generator with detector and annotator plugins.
---

Plugins let you add framework-specific detection, cross-file enrichment, or custom post-processing to the CEM generator without changing the core pipeline.

## Plugin types

| Type | When it runs | Use case |
|------|--------------|----------|
| **Detector** | Per-file, during analysis | Find framework-specific patterns |
| **Annotator** | After the full manifest is assembled | Cross-plugin enrichment, design tokens, or validation |

## Using a plugin

Plugins are passed to `generateCem()`:

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { myPlugin } from "@wc-toolkit/plugin-my-framework";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [myPlugin()],
});
```

Framework plugins are opt-in. The vanilla detector runs automatically, while
framework-specific detectors run only when included in `plugins`.

## How the generator is structured

The pipeline separates plugin responsibilities from manifest assembly:

- **Detection** extracts class-level fragments from source files.
- **Core pipeline** merges fragments, applies conflict policy, and runs
  post-processing.
- **Core utilities** provide shared JSDoc parsing and inheritance resolution.
- **Output** converts the internal manifest into the CEM 2.1.0 package shape.

The built-in vanilla detector handles standard `HTMLElement` components without
a plugin. All detectors share one TypeScript `ts.Program`, and detectors do not
depend directly on one another. Cross-plugin enrichment belongs in annotators.

## Official Plugins

- [Lit Plugin](/plugins/lit/) — Detects `@customElement`, `@property`, `@state`, `@query`, `@eventOptions`, and Lit-specific JSDoc tags.
- [FAST Plugin](/plugins/fast/) — Detects FAST elements, decorators, attributes, and emitted events.
- [Preact Plugin](/plugins/preact/) — Detects `preact-custom-element` registrations and typed Preact component props.
- [Vue Plugin](/plugins/vue/) — Detects Vue custom elements created with `defineCustomElement`.
- [Solid Plugin](/plugins/solid/) — Detects Solid Element `customElement` registrations and typed props.
- [Svelte Plugin](/plugins/svelte/) — Detects Svelte components compiled as custom elements.
- [Stencil Plugin](/plugins/stencil/) — Detects Stencil components, props, and events.

## Build Integrations

- [Bundler Plugin](/guide/bundler/) — Generates the manifest from Vite, Rollup, Rolldown, or Webpack builds.

## Built-in

- **Vanilla Built-in Detector** — Always runs; detects standard custom element JSDoc tags on classes extending `HTMLElement`.
- **Inheritance Annotator** — Built-in; materializes inherited APIs from superclass chain. Disable with `inheritance: false`.

## Writing Custom Plugins

See [Creating Plugins](/plugins/creating-plugins/) for the complete authoring guide (detector/annotator contracts, TypeScript AST analysis, JSDoc utilities, patch targeting, and examples).
