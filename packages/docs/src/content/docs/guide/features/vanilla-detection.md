---
title: Vanilla Detection
description: Built-in detection for vanilla web components without any plugins.
---

`@cem-generator/core` detects vanilla web components out of the box — no plugins required.

## What's detected

| Feature | Source | Output |
|---------|--------|--------|
| Custom elements | `class extends HTMLElement` + `customElements.define()` | `declarations[].tagName` |
| Attributes | `static observedAttributes` | `attributes[]` |
| Properties & methods | Class fields/methods | `members[]` |
| Events | `@fires` JSDoc tag | `events[]` |
| Slots | `<slot>` elements in template literals + `@slot` JSDoc tag | `slots[]` |
| CSS custom properties | `:host` + `@property` in templates, `@cssprop` JSDoc tag | `cssProperties[]` |
| CSS shadow parts | `part="..."` in templates + `@csspart` JSDoc tag | `cssParts[]` |
| CSS custom states | `ElementInternals` `.states.add(...)` + `@cssState` JSDoc tag | `cssStates[]` |
| Metadata | `@summary`, `@deprecated`, comment body | Per-item fields |

## Usage

```ts
import { generateCem } from "@cem-generator/core";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  // no plugins needed for vanilla components
});
```

## Example

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

  connectedCallback() {
    this.innerHTML = `
      <!-- Default content -->
      <slot></slot>
      <!-- Icon slot -->
      <slot name="icon"></slot>
    `;
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

Output (trimmed):
```json
{
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
    "events": [{ "name": "my-toggle", "type": { "text": "Event" } }],
    "slots": [
      { "name": "", "description": "Default content" },
      { "name": "icon", "description": "Icon slot" }
    ]
  }]
}
```