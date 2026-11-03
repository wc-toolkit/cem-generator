---
title: LWC Plugin
description: Detector plugin for Salesforce Lightning Web Components.
---

`@wc-toolkit/cem-generator-lwc` detects components built with
[Lightning Web Components](https://developer.salesforce.com/docs/platform/lwc/overview).

## Detects

- classes extending `LightningElement`, directly or through a local base class
- component tag names derived from bundle folders, such as `c-greeting-card`
- `@api` properties, accessors, and methods as the public API
- `@api` properties as kebab-case attributes (`recipientName` → `recipient-name`)
- `new CustomEvent("name", ...)` dispatches as events
- `<slot>` elements in the bundle's sibling `.html` template
- standard members, types, and JSDoc metadata through the core generator

`@track` fields, `@wire` members, private fields, undecorated methods, and
lifecycle hooks such as `connectedCallback` and `render` are not part of the
public API and are excluded from the member list.

## Component naming

LWC components are identified by their bundle folder. The default export of a
file whose name matches its folder becomes a custom element:

```text
greetingCard/
  greetingCard.js
  greetingCard.html
```

This produces the tag `c-greeting-card`. Other classes, such as shared base
classes, are documented without a tag and with `customElement: false`.

Set `namespace` if your project does not use the default `c` namespace:

```ts
lwcPlugin({ namespace: "acme" }); // acme-greeting-card
```

## Documenting Web Component APIs

Document the component and its public APIs with JSDoc. `@api` decorators
provide member and attribute metadata. Standard CEM tags cover anything the
plugin cannot infer:

```js
/**
 * A greeting card with a recipient and message.
 * @summary Displays a greeting.
 */
export default class GreetingCard extends LightningElement {
  /** Name of the recipient. */
  @api recipientName = "World";

  /** Clears the draft text. */
  @api reset() {
    this.draft = "";
  }

  handleClick() {
    this.dispatchEvent(new CustomEvent("select", { detail: { id: this.recipientName } }));
  }
}
```

The example documents the following manifest APIs:

| Source                                    | Manifest API                                      |
| ----------------------------------------- | ------------------------------------------------- |
| Class comment                             | `description`, `summary`, `tagName`, `deprecated` |
| `@api` property or accessor and its JSDoc | `members` and `attributes`                        |
| `@api` method and its JSDoc               | `members` (method)                                |
| `new CustomEvent("name", ...)`            | `events`                                          |
| `<slot>` in the `.html` template          | `slots`, using the preceding HTML comment         |
| `@event` or `@fires`                      | `events`                                          |
| `@cssprop`, `@cssState`                   | `cssProperties`, `cssStates`                      |

## Events

Static `CustomEvent` and `Event` dispatches written inline in the component
are documented automatically. The `detail` argument's type is included when
present:

```js
this.dispatchEvent(new CustomEvent("select", { detail: { id: this.recipientName } }));
```

This produces an event named `select` with a detail type of `{ id: string; }`.
Dynamic event names and events dispatched through a separately constructed
variable cannot be determined statically. Use `@event` or `@fires` JSDoc for
those.

## Slots

The plugin reads the sibling template for each component bundle. Named and
default slots are documented, and an HTML comment immediately before a slot
becomes its description:

```html
<template>
  <section>
    <!-- Main content of the card -->
    <slot></slot>
    <!-- Footer content -->
    <slot name="footer"></slot>
  </section>
</template>
```

## Usage

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { lwcPlugin } from "@wc-toolkit/cem-generator-lwc";

const manifest = generateCem({
  plugins: [lwcPlugin()],
});
```

With options:

```ts
const manifest = generateCem({
  plugins: [lwcPlugin({ namespace: "acme" })],
});
```
