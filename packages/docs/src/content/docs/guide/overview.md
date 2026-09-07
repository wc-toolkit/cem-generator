---
title: Overview
description: What cem-generator does, why it helps, and how to get started.
---

`cem-generator` generates a **Custom Elements Manifest (CEM)** — a machine-readable JSON file describing your custom elements. This manifest powers documentation sites, IDE autocomplete, and tooling across the web components ecosystem.

## Install

```bash
# Core only (vanilla components)
npm install -D @wc-toolkit/cem-generator

# With CLI
npm install -D @wc-toolkit/cem-generator-cli
```

## Quick Start

### Programmatic API

```ts
// generate-cem.ts
import { generateCem } from "@wc-toolkit/cem-generator";
import fs from "node:fs";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
});

fs.writeFileSync("custom-elements.json", JSON.stringify(manifest, null, 2));
```

```bash
npx tsx generate-cem.ts
```

### CLI

```bash
# Zero-config (uses ./tsconfig.json -> ./custom-elements.json)
npx @wc-toolkit/cem-generator-cli generate
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
- Slot elements in template literals → `slots`
- `:host` declarations and `@property` rules in template literals → `cssProperties`
- `part="..."` attributes in template literals → `cssParts`
- `ElementInternals` `.states.add(...)` calls → `cssStates`
- JSDoc tags:
  - `@fires` → `events`
  - `@slot` → `slots`
  - `@cssprop` → `cssProperties`
  - `@csspart` → `cssParts`
  - `@cssState` → `cssStates`
  - `@deprecated`, `@summary`, and the comment body → `description`
- Inheritance: resolves superclass chain automatically

## Framework plugins

Framework-specific detection is opt-in via plugins. See the [Plugins](/plugins/) docs to add support for a particular component framework.

## Next steps

- [Configuration](/guide/configuration/) — All `generateCem()` options
- [Documenting](/guide/documenting/) — JSDoc tags reference
- [CLI](/guide/cli/) — Command-line reference
