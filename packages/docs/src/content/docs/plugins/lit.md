---
title: Lit Plugin
description: Reference detector plugin for Lit projects.
---

@wc-toolkit/cem-generator-lit demonstrates framework-specific detection on top of the generator.

## Detects

- classes extending `LitElement`
- shared class API members, including fields, methods, parameters, and return types
- decorated fields from `@property(...)` and `@state(...)`, including decorator aliases
- `static properties` declarations
- `@customElement("tag-name")` registrations
- direct callable mixins such as `InputMixin(LitElement)`
- class JSDoc tags (`@tag`, `@event`, `@cssprop`, etc.)
- CSS parts from template `part="..."` attributes

Lit lifecycle methods such as `render`, `updated`, and `requestUpdate` are
excluded from the public API member list. Component methods that dispatch
static `Event` or `CustomEvent` instances are detected by core automatically.

## Documenting Web Component APIs

Use the component JSDoc comment for element-level metadata and API contracts.
Lit property decorators provide member and attribute metadata; standard CEM
tags document events, slots, and styling APIs:

```ts
/**
 * A button with an icon and loading state.
 *
 * @summary Activates an action when pressed.
 * @tag icon-button
 * @slot icon - Optional icon content.
 * @slot - Button label.
 * @event {CustomEvent} activate - Fired after activation.
 * @cssprop [--icon-button-color=currentColor] - Icon color.
 * @csspart button - The native button element.
 * @cssState loading - The button is processing an action.
 */
@customElement("icon-button")
export class IconButton extends LitElement {
  /** Accessible label. */
  @property({ attribute: "aria-label" }) label = "";

  /** Prevents activation. */
  @property({ type: Boolean, reflect: true }) disabled = false;

  /** Internal loading state. */
  @state() loading = false;

  /** Activates the button. */
  activate() {
    this.dispatchEvent(new CustomEvent("activate"));
  }

  render() {
    return html`
      <button part="button" ?disabled=${this.disabled}>
        <slot name="icon"></slot><slot></slot>
      </button>
    `;
  }
}
```

The example documents the following manifest APIs:

| Source | Manifest API |
|---|---|
| Class comment | `description`, `summary`, `tagName`, `deprecated` |
| `@property` / `static properties` | `members` and `attributes` |
| Method JSDoc and signature | Member description, parameters, return type |
| `@event` / `@fires` or static dispatch | `events` |
| `<slot>` or `@slot` | `slots` |
| `part="..."` or `@csspart` | `cssParts` |
| `@cssprop` or `static styles` | `cssProperties` |
| `@cssState` | `cssStates` |

Document individual properties and methods immediately above their
declarations. Use `@default`, `@attr`, `@reflect`, `@deprecated`, or
`@internal` when the inferred metadata needs to be refined. See
[Documenting Components](/guide/documenting/) for the complete tag reference.

## Properties

Both decorator and legacy static-property forms are supported:

```ts
@property({ attribute: "value", reflect: true })
value = "";

static properties = {
  disabled: { type: Boolean, reflect: true },
};
```

The generated fields include their mapped attribute and reflection metadata.

## Mixins

Direct callable mixins are analyzed and their members are copied to the
component with `inheritedFrom` metadata:

```ts
class MyButton extends InputMixin(LitElement) {}
```

## CSS Custom Properties

CSS custom properties are auto-detected from the static `styles` tagged template, from two constructs.

### CSS `@property` rules

A `@property --token { ... }` rule records the token `name`, `initial-value` as the `default`, `syntax`, and any preceding `/** */` JSDoc comment as the `description`:

```ts
/** Demonstrates CSS custom property metadata from a Lit stylesheet. */
export class MyButton extends LitElement {
  static styles = css`
    /** Foreground token contract for host styling. */
    @property --my-button-fg {
      syntax: "<color>";
      initial-value: white;
      inherits: true;
    }
  `;
}
```

Result:

```json
{
  "name": "--my-button-fg",
  "syntax": "<color>",
  "default": "white",
  "description": "Foreground token contract for host styling."
}
```

### Declarations under `:host`

A `--token: value;` declaration under a `:host` selector records the token `name`, the value as the `default`, and any preceding `/** */` JSDoc comment as the `description`:

```ts
/** Demonstrates CSS custom property metadata declared under `:host`. */
export class MyButton extends LitElement {
  static styles = css`
    :host {
      /** Background token contract for host styling. */
      --my-button-bg: steelblue;
    }
  `;
}
```

Result:

```json
{
  "name": "--my-button-bg",
  "default": "steelblue",
  "description": "Background token contract for host styling."
}
```

## Rules

- does not auto-document `var(--token)` usage-only references
- JSDoc can enrich or override detected CSS part/property descriptions
- when the same token appears in both a `@property` rule and a `:host` declaration, the two sources are merged (description/syntax/default from `@property` fills the gaps)

## Automatic API Discovery

Lit uses the same core discovery rules for HTML and CSS template literals:

```ts
render() {
  return html`
    <!-- Panel wrapper -->
    <div part="container">

      <!-- Header content -->
      <slot name="header"></slot>

      <!-- Default content -->
      <slot></slot>
    </div>
    <style>
      :host { 
        /** Panel color. */ 
        --panel-color: gray; 
      }
    </style>
  `;
}

activate() {
  this.dispatchEvent(new CustomEvent("activate"));
}
```

This auto-detects default/named slots, CSS parts, CSS custom properties under
`:host`, literal `.states.add("name")` CSS states, and static `Event` or
`CustomEvent` dispatches. Dynamic names are skipped; use the standard JSDoc
tags for dynamic or more richly documented APIs. HTML comments immediately
before slots or parts become their CEM descriptions, and CSS comments before
custom property declarations become CSS property descriptions.

## Usage

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { litPlugin } from "@wc-toolkit/cem-generator-lit";

const manifest = generateCem({
  plugins: [litPlugin()],
});
```
