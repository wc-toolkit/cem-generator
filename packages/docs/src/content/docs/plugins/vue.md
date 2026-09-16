---
title: Vue Plugin
description: Generate a Custom Elements Manifest for Vue custom elements.
---

`@wc-toolkit/cem-generator-vue` detects custom elements created with Vue's
[`defineCustomElement`](https://vuejs.org/guide/extras/web-components.html#building-custom-elements-with-vue).

## Installation

```sh
pnpm add -D @wc-toolkit/cem-generator-vue vue
```

## Supported pattern

The plugin reads Vue component options, including `props` and `emits`, and
uses the tag passed to `customElements.define`:

It also auto-detects slots and parts in string templates, CSS custom
properties in `template`/`styles` strings, and static event dispatches in the
component options.

```ts
import { defineCustomElement } from "vue";

const Greeting = defineCustomElement({
  props: {
    /** Name shown by the greeting. */
    name: String,
    count: { type: Number, default: 1 },
  },
  emits: ["greet"],
});

customElements.define("vue-greeting", Greeting);
```

### Automatic API discovery

The plugin scans Vue custom-element options for slots, parts, styles, and
static events:

```ts
const Panel = defineCustomElement({
  template: `
    <!-- Panel wrapper -->
    <section part="panel">

      <!-- Header content -->
      <slot name="header"></slot>

      <!-- Main content -->
      <slot></slot>
    </section>
  `,
  styles: [`:host { /** Panel color. */ --panel-color: gray; }`],
  mounted() {
    this.$el.dispatchEvent(new CustomEvent("panel-ready"));
  },
});
```

This produces a default slot, a `header` slot, a `panel` CSS part, a
`--panel-color` CSS property, and a `panel-ready` event. Vue `emits` entries
and JSDoc event tags are merged with discovered events. Dynamic names are
skipped and should be documented explicitly. HTML comments immediately before
slots or parts become their CEM `description` fields, and CSS comments before
custom property declarations become CSS property descriptions.

## Documenting APIs

Document the custom element on the variable passed to `defineCustomElement`.
The comment body becomes the component description, and the standard CEM tags
add metadata for the other public APIs:

```ts
import { defineCustomElement } from "vue";

/**
 * A notification panel that displays a title and status.
 *
 * @summary Displays status information with optional actions.
 * @tag status-panel
 * @slot - Main panel content.
 * @slot actions - Buttons or links rendered in the action area.
 * @event {CustomEvent} status-change - Fired when status changes.
 * @event close - Fired when the panel is dismissed.
 * @cssprop [--status-panel-color=steelblue] - Accent color.
 * @cssprop --status-panel-gap - Space between panel sections.
 * @csspart panel - The outer panel wrapper.
 * @csspart actions - The actions wrapper.
 * @cssState busy - The panel is waiting for an operation to finish.
 */
const StatusPanel = defineCustomElement({
  props: {
    /** Text displayed in the panel heading. */
    title: { type: String, required: true },
    /** Current status value. */
    status: { type: String, default: "ready" },
    /** Prevents user interaction while busy. */
    disabled: Boolean,
  },
  emits: ["status-change", "close"],
  template: `
    <section part="panel">
      <h2>{{ title }}</h2>
      <slot></slot>
      <div part="actions"><slot name="actions"></slot></div>
    </section>
  `,
});

customElements.define("status-panel", StatusPanel);
```

### Component metadata

Use the variable-level JSDoc comment for metadata that describes the whole
element:

| JSDoc                | Manifest API  | Example                                 |
| -------------------- | ------------- | --------------------------------------- |
| Comment body         | `description` | `A notification panel...`               |
| `@summary`           | `summary`     | `@summary Displays status information.` |
| `@tag` or `@tagname` | `tagName`     | `@tag status-panel`                     |
| `@deprecated`        | `deprecated`  | `@deprecated Use alert-panel instead.`  |

The tag passed to `customElements.define` is used as `tagName` when no `@tag`
tag is present.

### Props and attributes

Vue `props` become manifest `members` and `attributes`. Add a JSDoc comment to
each prop for its description. Vue's primitive constructors provide the prop
type, and an object-form prop can provide a `default` value:

```ts
const UserBadge = defineCustomElement({
  props: {
    /** User name shown beside the avatar. */
    name: { type: String, required: true },
    /** Avatar size in pixels. */
    size: { type: Number, default: 32 },
    /** Shows the online indicator. */
    online: Boolean,
  },
});
```

This produces `name`, `size`, and `online` members and matching attributes.
`String`, `Number`, `Boolean`, `Object`, and `Array` are reported as
`string`, `number`, `boolean`, `object`, and `array` respectively.

### Events

List emitted event names with Vue's `emits` option:

```ts
const SearchBox = defineCustomElement({
  emits: ["search", "clear"],
});
```

This creates event entries named `search` and `clear`. Add `@event` or
`@fires` tags to the component comment when an event needs a description or a
detail type:

```ts
/**
 * @event {CustomEvent} search - A search was submitted.
 * @fires clear - The current query was cleared.
 */
const SearchBox = defineCustomElement({
  emits: ["search", "clear"],
});
```

### Slots

Vue slots are native slots in a custom element. Document the default slot with
`-`, and named slots with their slot name:

```ts
/**
 * @slot - Main content.
 * @slot header - Content rendered above the main content.
 * @slot footer - Content rendered below the main content.
 */
const Card = defineCustomElement({
  template: `
    <header><slot name="header"></slot></header>
    <main><slot></slot></main>
    <footer><slot name="footer"></slot></footer>
  `,
});
```

### CSS APIs

Document styling hooks with `@cssprop` (custom properties), `@csspart`
(shadow parts), and `@cssState` (custom states):

```ts
/**
 * @cssprop [--card-background=white] - Card background color.
 * @cssprop --card-padding - Card inner padding.
 * @csspart container - The card container.
 * @csspart header - The card header.
 * @cssState expanded - The card is expanded.
 */
const Card = defineCustomElement({
  template: `
    <article part="container">
      <header part="header"><slot name="header"></slot></header>
      <slot></slot>
    </article>
  `,
});
```

These become `cssProperties`, `cssParts`, and `cssStates` in the manifest.
Use the bracket form `[--name=default]` to document a custom property default.

For additional JSDoc tags, omission rules, and manifest field details, see
[Documenting Components](/guide/documenting/).

## Usage

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { vuePlugin } from "@wc-toolkit/cem-generator-vue";

const manifest = generateCem({
  plugins: [vuePlugin()],
});
```

The repository includes a runnable example. Run `pnpm demo:vue` from the
repository root to generate `packages/plugins/vue/demo/custom-elements.json`.
