---
title: Solid Plugin
description: Generate a Custom Elements Manifest for Solid Element components.
---

`@wc-toolkit/cem-generator-solid` detects custom elements created with
[`solid-element`](https://github.com/solidjs/solid/tree/main/packages/solid-element).

## Installation

```sh
pnpm add -D @wc-toolkit/cem-generator-solid solid-element solid-js
```

## Supported pattern

Solid Element registers a custom element with a tag name, default props, and a
template function:

```tsx
import { customElement } from "solid-element";

interface GreetingProps {
  /** Name displayed by the greeting. */
  name: string;
  /** Number of times to repeat the greeting. */
  count?: number;
}

export const Greeting = customElement(
  "solid-greeting",
  { name: "World", count: 1 },
  (props: GreetingProps) => (
    <>
      {/* Greeting text */}<p>{props.name} {props.count}</p>
    </>
  ),
);
```

The plugin uses the tag as `tagName`, default props as public members, and
typed template props to enrich member types and descriptions. Solid Element
exposes these props as properties and hyphenated attributes.

The plugin also auto-detects `<slot>` elements and `part` attributes in the
Solid JSX template, CSS custom properties in template-literal styles, and
static `Event` or `CustomEvent` dispatches.

### Automatic API discovery

```tsx
const Panel = customElement("status-panel", {}, (props, { element }) => (
  <>
    <style>{`:host { /** Panel color. */ --panel-color: gray; }`}</style>
    {/* Panel wrapper */}
    <section part="panel">
      {/* Header content */}<slot name="header" />
      {/* Default content */}<slot />
    </section>
    <button onClick={() => element.dispatchEvent(new CustomEvent("change"))}>
      Change
    </button>
  </>
));
```

This produces default/named slots, a `panel` CSS part, a CSS custom property,
and a `change` event. Comments immediately before JSX slots or parts become
their CEM `description` fields; CSS comments before custom property
declarations become CSS property descriptions. Literal `.states.add("name")`
calls are also reported as CSS custom states. Dynamic names should use the
corresponding JSDoc tags.

## Documenting APIs

Use JSDoc on the registration call and its props to document the complete Web
Component API:

```tsx
import { customElement } from "solid-element";

interface StatusProps {
  /** Current task status. */
  status: "ready" | "busy" | "done";
  /** Prevents user interaction. */
  disabled?: boolean;
}

/**
 * A task status indicator.
 *
 * @summary Shows the current state of a task.
 * @tag status-indicator
 * @slot - Optional status label.
 * @slot actions - Buttons rendered beside the status.
 * @event {CustomEvent} status-change - Fired when the status changes.
 * @cssprop [--status-color=green] - Indicator color.
 * @csspart indicator - The visual status indicator.
 * @cssState busy - The task is in progress.
 */
export const StatusIndicator = customElement(
  "status-indicator",
  {
    /** Status used before the first update. */
    status: "ready",
    /** Disables interaction. */
    disabled: false,
  },
  (props: StatusProps) => (
    <>
      <style>{`:host { /** Status color. */ --status-color: green; }`}</style>
      {/* Status indicator */}
      <div part="indicator">

        {/* Main content */}
        <slot></slot>

        {/* Action buttons */}
        <slot name="actions"></slot>
        {props.status}
      </div>
    </>
  ),
);
```

### Manifest mapping

| Source | Manifest API |
|---|---|
| Registration JSDoc | `description`, `summary`, `tagName`, `deprecated` |
| Default props and typed template props | `members` and `attributes` |
| Prop JSDoc | Member and attribute descriptions |
| Static `Event`/`CustomEvent` dispatch or `@event` / `@fires` | `events` |
| `<slot>` or `@slot` | `slots` |
| `part="..."` or `@csspart` | `cssParts` |
| Solid style template or `@cssprop` | `cssProperties` |
| `@cssState` | `cssStates` |

Default props are the runtime public props recognized by Solid Element. The
plugin maps `someProp` to the `some-prop` attribute and uses the template
parameter type to discover additional typed props. Use `@default`,
`@deprecated`, or `@internal` in JSDoc when inferred metadata needs refinement.

See [Documenting Components](/guide/documenting/) for the complete JSDoc tag
reference.

## Usage

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { solidPlugin } from "@wc-toolkit/cem-generator-solid";

const manifest = generateCem({
  plugins: [solidPlugin()],
});
```

Run the repository demo with `pnpm demo:solid` to generate
`packages/plugins/solid/demo/custom-elements.json`.
