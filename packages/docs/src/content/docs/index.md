---
title: Overview
description: Generate Custom Elements Manifests for component libraries quickly and extensibly.
---

`cem-generator` turns your web component source into a **Custom Elements Manifest (CEM)** — a machine-readable description of your components, properties, attributes, events, slots, and styling APIs.

It makes component-library development easier by automating the metadata work that is otherwise easy to miss or maintain by hand. The generated manifest can power documentation, editor autocomplete, validation, framework integrations, and generated type definitions from one source of truth.

You can start with the interactive CLI, use the programmatic API, or extend detection with framework plugins. JavaScript and TypeScript projects are supported.

## Quick Setup

Initialize a project interactively. The CLI creates the generator configuration,
asks which parser and integration plugins to use, and can install the selected
packages:

```bash
npx @wc-toolkit/cem-generator-cli init
```

## Manual Install

```bash
npm install -D @wc-toolkit/cem-generator
```

## Usage

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
