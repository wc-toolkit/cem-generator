---
title: Overview
description: Generate Custom Elements Manifests for component libraries quickly and extensibly.
---

`cem-generator` generates a **Custom Elements Manifest (CEM)** for your component library — a machine-readable description of your custom elements (tag names, attributes, members, events, slots, CSS properties and parts) that powers documentation, IDE support, and tooling. Point it at a TypeScript project and it emits a manifest compatible with the official `custom-elements-manifest` schema (2.1.0).

## Install

```bash
npm install -D @cem-generator/core
```

## Usage

If your project has a TS config other than one at the root of the project called `tsconfig.json`, you can add it to the `generateCem` config:

```ts
import { generateCem } from "@cem-generator/core";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.lib.json",
});
```

Framework-specific detection is opt-in via plugins — see the [Plugins](/plugins/) docs.

## Demo

Given a vanilla component like this:

```ts
/**
 * A simple toggle element.
 *
 * @fires my-toggle - Fired when the element is toggled.
 */
export class MyElement extends HTMLElement {
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
customElements.define("my-element", MyElement);
```

`generateCem()` produces a manifest describing it (trimmed):

```json
{
  "schemaVersion": "2.1.0",
  "modules": [
    {
      "kind": "javascript-module",
      "path": "my-element.ts",
      "declarations": [
        {
          "kind": "class",
          "customElement": true,
          "name": "MyElement",
          "description": "A simple toggle element.",
          "tagName": "my-element",
          "members": [
            { "kind": "field", "name": "disabled", "type": { "text": "boolean" } },
            { "kind": "method", "name": "toggle" }
          ],
          "attributes": [{ "name": "disabled" }],
          "events": [{ "name": "my-toggle", "type": { "text": "Event" } }]
        }
      ],
      "exports": [
        {
          "kind": "custom-element-definition",
          "name": "my-element",
          "declaration": { "name": "MyElement", "module": "my-element.ts" }
        }
      ]
    }
  ]
}
```

## What it detects

Vanilla web components work out of the box — no plugin needed:

- classes extending `HTMLElement`, including `observedAttributes`, members, and `customElements.define()` tag names,
- events, slots, CSS properties and parts documented via JSDoc (`@fires`, `@slot`, `@cssprop`, `@csspart`, …),
- inherited APIs, resolved automatically through the superclass chain.

## Next steps

- See [Installation](/installation/) for full setup, `include`/`exclude` filtering, and verifying output.
- See [CLI](/cli/) for command-line generation with `cem generate`.
- See [Creating Plugins](/plugins/creating-plugins/) for how `generateCem()` builds a manifest and runs plugin hooks.
- See [Inheritance](/guide/features/inheritance/) for omitting inherited APIs and using external manifests.
- See [Plugins](/plugins/) for custom detectors and annotators.
