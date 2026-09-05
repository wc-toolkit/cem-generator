---
title: Plugin System
description: Detector and annotator plugin contracts.
---

The plugin model is intentionally minimal.

## Detector plugins

- `claims(sourceText, filePath)`: fast text-level opt-in check.
- `onFile(context)`: returns class fragments for claimed files.
- `afterFile?(context, ownFragment)`: optional file-level follow-up.
- `afterAllFiles?(manifest)`: optional cross-file patch pass.

Detectors should stay framework-focused and avoid global coupling.

## Annotator plugins

- `afterManifest(manifest)`: runs after detection and built-in inheritance.
- Intended for additive enrichment and cross-cutting metadata.

## Patch targeting

- Prefer `byDeclaration` for unambiguous targeting: `<module-path>#<class-name>`.
- `byClassName` is supported but can be ambiguous for repeated class names.
