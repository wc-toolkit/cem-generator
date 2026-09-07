---
title: Preact Plugin
description: Generate a Custom Elements Manifest for Preact components registered with preact-custom-element.
---

`@wc-toolkit/cem-generator-preact` detects Preact components registered with
[`preact-custom-element`](https://github.com/preactjs/preact-custom-element).

## Installation

```sh
pnpm add -D @wc-toolkit/cem-generator-preact preact-custom-element
```

## Detects

- `register(Component, "tag-name", ["attribute"])` calls
- exported function components and local component declarations
- typed function props as manifest members
- observed attributes linked to their corresponding props
- JSDoc descriptions on component props
- static `tagName` and `observedAttributes` values on class components

For example:

```tsx
import register from "preact-custom-element";

interface GreetingProps {
  /** The name displayed by the greeting. */
  name?: string;
}

export function Greeting({ name = "World" }: GreetingProps) {
  return <p>Hello, {name}!</p>;
}

register(Greeting, "x-greeting", ["name"]);
```

The generated declaration is associated with `x-greeting`, includes `name` as a
member, and exposes `name` as an attribute.

## JSDoc Metadata

JSDoc on the component and its props is copied into the manifest. Standard
component tags can describe the element, while a JSDoc comment on an interface
property describes the generated member and attribute:

```tsx
import register from "preact-custom-element";

/**
 * Displays a promotional message.
 * @summary A compact promotional banner.
 * @deprecated Use `x-message` instead.
 */
export function Promo({ message, tone = "info" }: PromoProps) {
  return <aside data-tone={tone}>{message}</aside>;
}

interface PromoProps {
  /** Message content shown to the user. */
  message: string;
  /** Visual treatment for the message. */
  tone?: "info" | "success" | "warning";
}

register(Promo, "x-promo", ["message", "tone"]);
```

This produces a `Promo` declaration with a summary and deprecation notice,
plus documented `message` and `tone` members and attributes.

## Registration Arguments

`preact-custom-element` accepts the component, tag name, observed attributes,
and an options object:

```tsx
register(Promo, "x-promo", ["message", "tone"], { shadow: true });
```

The Preact plugin reads the first three arguments for manifest generation. The
fourth argument remains a runtime option for `preact-custom-element`; for
example, `shadow: true` controls where Preact renders but does not add a
separate manifest field.

## Multiple Attributes

List every attribute that should be observed as the third argument to
`register()`. Typed props become members, while only the listed props become
manifest attributes:

```tsx
interface StatusProps {
  /** Text displayed beside the status indicator. */
  label?: string;
  /** Current status value. */
  state?: "ready" | "busy" | "error";
  /** Whether the status can be dismissed. */
  dismissible?: boolean;
}

export function Status({ label, state = "ready", dismissible }: StatusProps) {
  return (
    <div data-state={state}>
      <span>{label}</span>
      {dismissible && <button type="button">Dismiss</button>}
    </div>
  );
}

register(Status, "x-status", ["label", "state", "dismissible"]);
```

The generated manifest contains three fields and three corresponding
attributes. Attribute values arrive at the Preact component as props through
`preact-custom-element`.

## Class Components

Class components can provide the tag name and observed attributes as static
properties. In that form the values can be omitted from `register()`:

```tsx
import { Component } from "preact";
import register from "preact-custom-element";

export class Counter extends Component {
  static tagName = "x-counter";
  static observedAttributes = ["value"];

  render() {
    return <output>{this.props.value ?? "0"}</output>;
  }
}

register(Counter);
```

The plugin uses `tagName` for the custom-element definition and
`observedAttributes` for the manifest attributes. For function components,
prefer an explicit tag and attribute list in the `register()` call.

## Using The Generated Element

After loading the module that calls `register()`, use the generated custom
element like any other HTML element:

```html
<x-greeting name="Ada"></x-greeting>
<x-status label="Build" state="ready" dismissible></x-status>
```

## Usage

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { preactPlugin } from "@wc-toolkit/cem-generator-preact";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [preactPlugin()],
});
```

The repository includes a runnable example. Run `pnpm demo:preact` from the
repository root to generate `packages/plugins/preact/demo/custom-elements.json`.
