---
title: Lit Plugin
description: Reference detector plugin for Lit projects.
---

@cem-generator/plugin-lit demonstrates framework-specific detection on top of core.

## Detects

- classes extending `LitElement`
- decorated fields from `@property(...)` and `@state(...)`
- class JSDoc tags (`@tag`, `@event`, `@cssprop`, etc.)
- CSS parts from template `part="..."` attributes

## CSS Custom Properties

CSS custom properties are auto-detected from the static `styles` tagged template, from two constructs.

### CSS `@property` rules

A `@property --token { ... }` rule records the token `name`, `initial-value` as the `default`, `syntax`, and any preceding `/** */` JSDoc comment as the `description`:

```ts
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
import { generateCem } from "@cem-generator/core";
import { litPlugin } from "@cem-generator/plugin-lit";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [litPlugin()],
});
```