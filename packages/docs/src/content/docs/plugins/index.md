---
title: Plugins
description: Extending cem-generator with detector and annotator plugins.
---

Plugins let you add framework-specific detection, cross-file enrichment, or custom post-processing to the CEM generator without changing the core pipeline.

There are two plugin contracts:

- **Detector plugins** extract class-level fragments from source files.
- **Annotator plugins** add or enrich manifest data after detection and inheritance.

See the individual plugin guides below.

- [Plugin System](/guide/plugins/)
- [Lit Plugin](/plugins/lit/)
