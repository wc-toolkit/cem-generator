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

FAST lifecycle and infrastructure members such as `connectedCallback`,
`disconnectedCallback`, `attributeChangedCallback`, `$fastController`, and
`$emit` are excluded from the public member list.

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

## Usage

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { fastPlugin } from "@wc-toolkit/cem-generator-fast";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [fastPlugin()],
});
```
