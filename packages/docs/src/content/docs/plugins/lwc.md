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

Set the [`namespace`](#options) option if your project does not use the default
`c` namespace.

## Options

`lwcPlugin()` accepts an optional object:

```ts
lwcPlugin({ namespace: "acme" }); // acme-greeting-card
```

| Option      | Type     | Default | Description                                                                                                                                     |
| ----------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `namespace` | `string` | `"c"`   | Prefix for generated tag names. The tag is `<namespace>-<kebab-case bundle name>`. Affects only tags; attribute and member names are unchanged. |

The namespace applies only to tags generated from bundle folders. An explicit
`@tag` JSDoc tag on the class overrides it.

`cem init` writes `lwcPlugin()` with no options. To set a namespace in a
generated project, edit the `plugins` entry in `cem-generator.config.mjs`:

```js
import { lwcPlugin } from "@wc-toolkit/cem-generator-lwc";

export default {
  plugins: [lwcPlugin({ namespace: "acme" })],
};
```

## Documenting APIs

Document the component in a class-level JSDoc block, and document each public
member inline above its declaration. The plugin reads both; it does not need any
LWC-specific tags for ordinary properties.

### Class-level JSDoc

The class block describes the element as a whole: its summary, description,
events, slots, and deprecation status.

```js
/**
 * A card that shows a title, body content, and an optional footer.
 *
 * Use it to group related content into a single visual unit.
 *
 * @summary Styled container with header and footer slots.
 * @fires {CustomEvent<{ id: string }>} card-select - Fired when the card is clicked.
 * @slot - Main body content.
 * @slot footer - Optional footer actions.
 * @deprecated Use `c-card-v2` instead.
 */
export default class Card extends LightningElement {
  // ...
}
```

| Tag                 | Manifest field                                |
| ------------------- | --------------------------------------------- |
| Comment body        | `description`                                 |
| `@summary`          | `summary`                                     |
| `@fires` / `@event` | `events[]`, with the type and description     |
| `@slot`             | `slots[]`; use `@slot -` for the default slot |
| `@deprecated`       | `deprecated`, with the message if provided    |

### Member-level JSDoc

Put the JSDoc directly above each `@api` member. Members without `@api` are
not part of the public API, so their tags have no effect on the manifest.

```js
export default class Card extends LightningElement {
  /**
   * Heading shown at the top of the card.
   * @default "Untitled"
   */
  @api title = "Untitled";

  /**
   * Visual variant of the card.
   * @attr variant
   */
  @api tone = "plain";

  /**
   * Makes the card selectable.
   * @summary Enables selection.
   */
  @api highlighted = false;

  /**
   * Clears the current selection.
   * @summary Resets selection state.
   */
  @api
  clearSelection() {
    this.selected = false;
  }

  /** Internal state, not part of the public API. */
  selected = false;

  /**
   * Internal tracking flag.
   * @internal
   */
  @api debugMode = false;

  handleClick() {
    this.dispatchEvent(new CustomEvent("card-select", { detail: { id: this.title } }));
  }
}
```

| Tag                     | Result                                                           |
| ----------------------- | ---------------------------------------------------------------- |
| `@default`              | Sets `default`, overriding the initializer                       |
| `@attr name`            | Sets the attribute name, instead of the kebab-case property name |
| `@summary`              | Sets a one-line `summary` on the member                          |
| `@internal` / `@ignore` | Removes the member from `members` and `attributes`               |
| (no `@api`)             | Excluded from the public API                                     |

Using the example above, the generated manifest contains:

- `title` as the `title` attribute, with default `"Untitled"`
- `tone` as the `variant` attribute, because of `@attr variant`
- `highlighted` with the summary "Enables selection"
- `clearSelection` as a method with the summary "Resets selection state"
- `card-select` as an event with the detail type `{ id: string; }`
- default and `footer` slots with their descriptions
- `debugMode` and `selected` are omitted

Neither `@attr` nor `@default` is required for ordinary properties. LWC property
names are converted to kebab-case automatically, so `@api recipientName`
already becomes `recipient-name`. Use `@attr` only when you want a different
attribute name.

## Events

Static `CustomEvent` and `Event` dispatches written inline in the component
are documented automatically. The `detail` argument's type is included when
present:

```js
this.dispatchEvent(new CustomEvent("select", { detail: { id: this.recipientName } }));
```

This produces an event named `select` with a detail type of `{ id: string; }`.
Add a class-level `@fires` or `@event` tag to describe the event or to give it a richer
type:

```js
/**
 * @fires {CustomEvent<{ id: string }>} select - Fired when a row is chosen.
 */
export default class RowList extends LightningElement {
  // ...
}
```

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
