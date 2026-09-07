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
- JSX `<slot>` elements and `part` attributes
- CSS custom properties in template-literal styles and static event dispatches

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

## Automatic API Discovery

The plugin scans the registered Preact component for native Web Component APIs
in JSX and template literals:

```tsx
export function Message({ open }: { open: boolean }) {
  document.dispatchEvent(new CustomEvent("message-opened"));

  return (
    <>
      <style>{`:host { /** Accent color. */ --message-color: steelblue; }`}</style>
      {/* Message container */}
      <article part="container">
        {/* Heading content */}
        <slot name="heading" />
        {/* Main message content */}
        <slot />
      </article>
    </>
  );
}
```

The generated metadata includes default and named slots, `part` tokens, CSS
custom properties under `:host`, and static `Event`/`CustomEvent` dispatches.
Comments immediately before JSX slots or parts become their CEM
`description` fields. A CSS comment immediately before a custom property
declaration becomes its description.
Static names are required. Dynamic names are skipped and can be documented
with `@slot`, `@csspart`, `@cssprop`, or `@event` / `@fires`.

## Documenting Web Component APIs

Use the component function's JSDoc for element-level metadata and the props
interface for members and attributes. Standard CEM tags document the other
Web Component APIs:

```tsx
/**
 * A message with optional actions.
 *
 * @summary Displays a message to the user.
 * @tag message-card
 * @slot - Message content.
 * @slot actions - Optional action buttons.
 * @event {CustomEvent} dismiss - Fired when dismissed.
 * @cssprop [--message-card-color=black] - Message text color.
 * @csspart card - The card wrapper.
 * @cssState expanded - The actions are visible.
 */
export function MessageCard({ message, expanded }: MessageProps) {
  return (
    <article part="card">
      <slot></slot>
      {expanded && <div><slot name="actions"></slot></div>}
    </article>
  );
}

interface MessageProps {
  /** Message content. */
  message: string;
  /** Shows the actions slot. */
  expanded?: boolean;
}

register(MessageCard, "message-card", ["message", "expanded"]);
```

The example documents the following manifest APIs:

| Source | Manifest API |
|---|---|
| Function comment | `description`, `summary`, `tagName`, `deprecated` |
| Props interface and property JSDoc | `members` and `attributes` |
| `@event` / `@fires` | `events` |
| `@slot` | `slots` |
| `@csspart` | `cssParts` |
| `@cssprop` | `cssProperties` |
| `@cssState` | `cssStates` |

Preact function props are the source of truth for member types. The attribute
list passed as the third argument to `register()` controls which props become
manifest attributes. Use `@default`, `@deprecated`, or `@internal` in the
relevant JSDoc comments when needed. See
[Documenting Components](/guide/documenting/) for the complete tag reference.

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
