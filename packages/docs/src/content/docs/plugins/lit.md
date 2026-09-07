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

## Usage

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { litPlugin } from "@wc-toolkit/cem-generator-lit";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [litPlugin()],
});
```
