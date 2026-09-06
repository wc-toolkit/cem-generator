---
title: Output Schema
description: The generated manifest conforms to Custom Elements Manifest Schema v2.1.0.
---

The generated manifest conforms to **Custom Elements Manifest Schema v2.1.0**:

```json
{
  "schemaVersion": "2.1.0",
  "modules": [
    {
      "kind": "javascript-module",
      "path": "src/my-element.ts",
      "declarations": [...],
      "exports": [...]
    }
  ]
}
```

## Compatibility

This manifest is compatible with:

- **@custom-elements-manifest/analyzer** tooling
- **web-component-analyzer** based docs generators
- **VS Code** custom elements extension
- **Storybook** web components addon
- Custom tooling via the official TypeScript types

## Schema types

Install types for your project:

```bash
npm install -D custom-elements-manifest
```

```ts
import type { Package } from "custom-elements-manifest";

const manifest: Package = generateCem({ ... });
```