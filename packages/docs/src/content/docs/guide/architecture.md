---
title: Architecture
description: Core design decisions behind the CEM generator.
---

The project intentionally separates concerns so framework support can evolve without changing the core pipeline contract.

## Layers

- Detection layer: extracts class-level fragments from source files.
- Pipeline layer: merges fragments, validates conflicts, runs post-processing.
- Utility layer: shared parsing/resolution logic used by detectors and post-processors.
- Output layer: converts internal fragments to CEM schema structures.

## Key principles

- Built-in vanilla support: classes extending `HTMLElement` and registered custom elements are discovered without extra plugins.
- Plugin isolation: detector plugins do not directly depend on each other.
- Shared TypeScript program: one `ts.Program` is reused across analysis.
- Additive and controlled patching: patch modes are explicit, with guardrails.

## Workspace structure

- `packages/core`
- `packages/core-utils`
- `packages/plugins/lit`
- `packages/docs`
