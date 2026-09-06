---
title: Options Reference
description: Complete reference for all generateCem() options.
---

## All `generateCem()` Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `plugins` | `Plugin[]` | `[]` | Detector/annotator plugins |
| `detectorConflictPolicy` | `"throw" \| "last-wins"` | `"throw"` | Conflict resolution |
| `inheritance` | `false \| InheritanceOptions` | `{}` | Inheritance materialization |
| `tsConfigPath` | `string` | `"./tsconfig.json"` | TypeScript config path |
| `include` | `string[]` | `[]` | Glob patterns to include |
| `exclude` | `string[]` | `[]` | Glob patterns to exclude |
| `sort` | `boolean` | `true` | Alphabetical sorting |
| `deprecatedLast` | `boolean` | `true` | Move deprecated to end |

## InheritanceOptions

```ts
interface InheritanceOptions {
  include?: Array<"members" | "attributes" | "cssProperties" | "cssParts" | "cssStates" | "slots" | "events">;
  ignore?: Array<"members" | "attributes" | "cssProperties" | "cssParts" | "cssStates" | "slots" | "events">;
  omitByKind?: {
    members?: string[];
    attributes?: string[];
    cssProperties?: string[];
    cssParts?: string[];
    cssStates?: string[];
    slots?: string[];
    events?: string[];
  };
  omitByClassName?: Record<string, OmitInheritedMap>;
  metadataField?: string;
  externalManifests?: unknown[];
  includeExternalManifests?: boolean;
}
```

See [Inheritance](/guide/inheritance/) for how JSDoc `@omit*` tags map into omission behavior.