---
title: Stencil
description: Generate a Custom Elements Manifest for Stencil components.
---

# Stencil Plugin

Use `@wc-toolkit/cem-generator-stencil` to detect Stencil components, props, and events.

```ts
import { stencilPlugin } from "@wc-toolkit/cem-generator-stencil";

generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [stencilPlugin()],
});
```

The plugin supports `@Component({ tag })`, `@Prop()` and `@Event()` metadata, including custom prop attributes, reflected props, and event names.
