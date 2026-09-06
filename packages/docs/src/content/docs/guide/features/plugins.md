---
title: Plugins
description: Extend detection with framework-specific or custom plugins.
---

Extend detection with framework-specific or custom plugins. Framework plugins are opt-in — see the [Plugins](/plugins/) docs for available framework plugins and how to author your own.

## Plugin types

| Type | When it runs | Use case |
|------|--------------|----------|
| **Detector** | Per-file, during analysis | Find framework-specific patterns |
| **Annotator** | After full manifest assembled | Cross-plugin enrichment, design tokens, validation |

## Using a plugin

Plugins are passed to `generateCem()`:

```ts
import { generateCem } from "@cem-generator/core";
import { myPlugin } from "@cem-generator/plugin-my-framework";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [myPlugin()]
});
```

See [Creating Plugins](/plugins/creating-plugins/) for building custom plugins.