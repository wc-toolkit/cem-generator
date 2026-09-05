---
title: Overview
description: What cem-generator does, why it helps, and how to get started.
---

`cem-generator` generates a **Custom Elements Manifest (CEM)** — a machine-readable JSON file describing your custom elements. This manifest powers documentation sites, IDE autocomplete, and tooling across the web components ecosystem.

## Why use it?

| Without cem-generator | With cem-generator |
|----------------------|-------------------|
| Manual manifest maintenance | Auto-generated from source |
| Docs drift out of sync | Docs always reflect code |
| No IDE support for your components | Full autocomplete & hover docs |
| Framework-specific tooling only | Works with any framework |

## Install

```bash
# Core only (vanilla components)
npm install -D @cem-generator/core

# With CLI
npm install -D @cem-generator/cli

# With Lit support
npm install -D @cem-generator/core @cem-generator/plugin-lit
```

## Quick Start

### Programmatic API

```ts
// generate-cem.ts
import { generateCem } from "@cem-generator/core";
import { litPlugin } from "@cem-generator/plugin-lit";
import fs from "node:fs";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [litPlugin()],
  detectorConflictPolicy: "last-wins",
});

fs.writeFileSync("custom-elements.json", JSON.stringify(manifest, null, 2));
```

```bash
npx tsx generate-cem.ts
```

### CLI

```bash
# Zero-config (uses ./tsconfig.json -> ./custom-elements.json)
npx @cem-generator/cli generate

# With Lit
npx @cem-generator/cli generate --lit --conflict-policy last-wins
```

## Demo

Given a vanilla component:

```ts
// my-toggle.ts
/**
 * A simple toggle element.
 *
 * @fires my-toggle - Fired when the element is toggled.
 */
export class MyToggle extends HTMLElement {
  static get observedAttributes() {
    return ["disabled"];
  }

  /** Whether the element is disabled. */
  disabled = false;

  /** Toggles the element and notifies listeners. */
  toggle() {
    this.dispatchEvent(new Event("my-toggle"));
  }
}
customElements.define("my-toggle", MyToggle);
```

Run `generateCem()` and get:

```json
{
  "schemaVersion": "2.1.0",
  "modules": [{
    "kind": "javascript-module",
    "path": "my-toggle.ts",
    "declarations": [{
      "kind": "class",
      "customElement": true,
      "name": "MyToggle",
      "description": "A simple toggle element.",
      "tagName": "my-toggle",
      "members": [
        { "kind": "field", "name": "disabled", "type": { "text": "boolean" } },
        { "kind": "method", "name": "toggle" }
      ],
      "attributes": [{ "name": "disabled" }],
      "events": [{ "name": "my-toggle", "type": { "text": "Event" } }]
    }],
    "exports": [{
      "kind": "custom-element-definition",
      "name": "my-toggle",
      "declaration": { "name": "MyToggle", "module": "my-toggle.ts" }
    }]
  }]
}
```

## What it detects (vanilla, no plugin)

- Classes extending `HTMLElement`
- `observedAttributes` → `attributes`
- Class fields/methods → `members`
- `customElements.define()` → `tagName`
- JSDoc tags:
  - `@fires` → `events`
  - `@slot` → `slots`
  - `@cssprop` → `cssProperties`
  - `@csspart` → `cssParts`
  - `@cssstate` → `cssStates`
  - `@deprecated`, `@summary`, `@description`
- Inheritance: resolves superclass chain automatically

## Framework plugins

| Framework | Package | Detects |
|-----------|---------|---------|
| Lit | `@cem-generator/plugin-lit` | `@property`, `@state`, `@query`, `static styles` CSS properties/parts |
| Your framework | Custom plugin | Whatever you need |

## Next steps

- [Configuration](/guide/configuration/) — All `generateCem()` options
- [Documenting](/guide/documenting/) — JSDoc tags reference
- [CLI](/cli/) — Command-line reference