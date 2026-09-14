---
title: Overview
description: What cem-generator does, why it helps, and how to get started.
---

`cem-generator` generates a **Custom Elements Manifest (CEM)** — a machine-readable JSON file describing your custom elements. This manifest powers documentation sites, IDE autocomplete, and tooling across the web components ecosystem.

## Why cem-generator?

`cem-generator` keeps your component source, documentation, and tooling metadata
in sync without asking you to maintain the same API in multiple places. You write
the component and its comments once; the generator turns that source into a
validated manifest that can power documentation, editor autocomplete, and build
integrations. It overlaps with CEM Analyzer and Lit Analyzer, but adds
capabilities that are especially useful outside a Lit-only or annotation-driven
workflow.

| Capability | Why it makes development easier |
| --- | --- |
| **Fast setup** | Go from install to a working manifest with one command. Vanilla projects need no plugin, and framework projects can select integrations interactively instead of wiring every package by hand. |
| **One source of truth** | API discovery and inline comments produce the manifest, so routine API or documentation changes do not require a second metadata file to update. |
| **TypeScript project awareness** | Uses your existing `tsconfig.json`, so aliases, included files, excluded files, and public types are interpreted the same way as the rest of your project. |
| **Fits your build workflow** | Use the same generator programmatically, from the CLI, or through Vite, Rollup/Rolldown, and Webpack integrations instead of maintaining a separate analysis workflow. |
| **API auto-discovery** | Finds properties, methods, attributes, events, slots, CSS custom properties, shadow parts, and custom states directly from source. |
| **Inline documentation** | Turns comments and standard JSDoc tags into manifest documentation next to the API they describe, keeping generated docs close to the code and reducing stale explanations. |
| **Validation before publishing** | Catches broken declaration references and invalid public type exposure during generation, before bad metadata reaches documentation sites or consumers. |
| **Complete, configurable inheritance** | Automatically includes inherited APIs across multi-level superclass chains, while JSDoc tags let you hide individual inherited members when they are not part of a component's intended public surface. |
| **Useful library metadata** | Preserves type information, inherited API provenance, external-manifest relationships, events, slots, and CSS metadata in the generated CEM. |
| **Predictable extension points** | Clear detector and annotator roles make custom behavior easier to add and safer to maintain, without forcing every plugin to understand the whole pipeline. |
| **Framework coverage without lock-in** | Start with vanilla components and add only the integrations you need. The same manifest workflow works across Lit, FAST, Stencil, Preact, Vue, Solid, and Svelte. |
| **Stable output** | Deterministic sorting produces cleaner diffs and makes generated manifests easier to review in pull requests. |
| **Modular installation** | Core, CLI, framework plugins, and bundler adapters are separate packages, so projects install only what they use. |

Use CEM Analyzer when you want its established analyzer/plugin ecosystem, or Lit
Analyzer when you need Lit-focused editor and template analysis. Choose
`cem-generator` when you need a generated CEM that is type-aware, validated, and
integrated with a broader component-library toolchain.

## Next steps

- [Documenting](/guide/documenting/) — JSDoc tags reference
- [Configuration](/guide/configuration/) — All `generateCem()` options
- [CLI](/guide/cli/) — Command-line reference
