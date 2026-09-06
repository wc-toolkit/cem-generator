---
title: Plugins
description: Extending cem-generator with detector and annotator plugins.
---

Plugins let you add framework-specific detection, cross-file enrichment, or custom post-processing to the CEM generator without changing the core pipeline.

## Official Plugins

- [Lit Plugin](/plugins/lit/) — Detects `@customElement`, `@property`, `@state`, `@query`, `@eventOptions`, and Lit-specific JSDoc tags.

## Built-in

- **Vanilla Built-in Detector** — Always runs; detects standard custom element JSDoc tags on classes extending `HTMLElement`.
- **Inheritance Annotator** — Built-in; materializes inherited APIs from superclass chain. Disable with `inheritance: false`.

## Writing Custom Plugins

See [Creating Plugins](/plugins/creating-plugins/) for the complete authoring guide (detector/annotator contracts, TypeScript AST analysis, JSDoc utilities, patch targeting, and examples).
