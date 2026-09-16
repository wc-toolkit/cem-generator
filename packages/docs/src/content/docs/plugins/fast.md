---
title: FAST Plugin
description: Detector plugin for Microsoft FAST components.
---

`@wc-toolkit/cem-generator-fast` detects components built with `@microsoft/fast-element`.

## Detects

- classes extending `FASTElement` or `FastElement`
- `@customElement("tag-name")` and `@customElement({ name: "tag-name" })`
- `@attr` fields, including custom names from `@attr({ attribute: "..." })`
- standard members, types, and JSDoc metadata through the core generator
- literal `$emit("event-name", detail)` calls as `CustomEvent` entries
- slots, parts, CSS custom properties, and CSS states in class template literals

FAST lifecycle and infrastructure members such as `connectedCallback`,
`disconnectedCallback`, `attributeChangedCallback`, `$fastController`, and
`$emit` are excluded from the public member list.

## Documenting Web Component APIs

Document the element and its public APIs with JSDoc. FAST decorators provide
property and attribute metadata; standard CEM tags cover the remaining Web
Component APIs:

```ts
/**
 * A status indicator for background work.
 *
 * @summary Shows whether a task is ready, busy, or finished.
 * @tag status-indicator
 * @slot - Optional status label.
 * @event {CustomEvent} status-change - Fired when the status changes.
 * @cssprop [--status-color=green] - Indicator color.
 * @csspart indicator - The visual indicator.
 * @cssState busy - The task is in progress.
 */
@customElement("status-indicator")
export class StatusIndicator extends FASTElement {
  /** Current status. */
  @attr status = "ready";

  /** Prevents updates from being announced. */
  @attr({ mode: "boolean" }) muted = false;

  /** Marks the task as complete. */
  complete() {
    this.$emit("status-change", { status: "complete" });
  }
}
```

The example documents the following manifest APIs:

| Source                                         | Manifest API                                      |
| ---------------------------------------------- | ------------------------------------------------- |
| Class comment                                  | `description`, `summary`, `tagName`, `deprecated` |
| `@attr` and field JSDoc                        | `members` and `attributes`                        |
| Method JSDoc and signature                     | Member description, parameters, return type       |
| `$emit("name", detail)` or `@event` / `@fires` | `events`                                          |
| `@slot`                                        | `slots`                                           |
| `@csspart`                                     | `cssParts`                                        |
| `@cssprop`                                     | `cssProperties`                                   |
| `@cssState`                                    | `cssStates`                                       |

Use `@default`, `@attr`, `@reflect`, `@deprecated`, or `@internal` to refine
member metadata. Literal `$emit` calls are inferred automatically; use
`@event` or `@fires` for dynamic event names. See
[Documenting Components](/guide/documenting/) for all supported tags.

FAST's `mode: "boolean"` option does not need special CEM metadata. The field type remains the source of truth:

```ts
@customElement("my-button")
export class MyButton extends FASTElement {
  @attr({ mode: "boolean" }) disabled = false;
}
```

## Events

Literal `$emit` calls are documented as `CustomEvent` entries. When a detail
argument is provided, its TypeScript type is included in the generated event
metadata:

```ts
activate() {
  this.$emit("button-activated", { source: this });
}
```

This produces an event named `button-activated` with a detail type of
`{ source: this; }`. Dynamic event names cannot be determined statically and
are not auto-documented; use `@event` or `@fires` JSDoc when needed.

## Automatic API Discovery

FAST components are scanned for HTML and CSS template literals anywhere in
the component class:

```ts
activate() {
  const template = html`
    <!-- Status indicator -->
    <div part="indicator">
      <!-- Label content -->
      <slot name="label"></slot>
      <!-- Default content -->
      <slot></slot>
    </div>
  `;
  const styles = css`
    :host {
      /** Indicator color. */
      --indicator-color: green;
    }`;

  this.$emit("status-change", { status: "done" });
}
```

This detects named/default slots, `part` tokens, CSS custom properties under
`:host`, literal `.states.add("name")` CSS states, and literal `$emit` events.
HTML comments immediately before slots or parts become their CEM
`description` fields. CSS comments before custom property declarations become
CSS property descriptions. Static names are required; use the standard JSDoc
tags for dynamic names or richer metadata.

## Usage

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { fastPlugin } from "@wc-toolkit/cem-generator-fast";

const manifest = generateCem({
  plugins: [fastPlugin()],
});
```
