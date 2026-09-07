---
title: Stencil
description: Generate a Custom Elements Manifest for Stencil components.
---

# Stencil Plugin

Use `@wc-toolkit/cem-generator-stencil` to detect Stencil components, props, and events.

```ts
import { stencilPlugin } from "@wc-toolkit/cem-generator-stencil";

generateCem({
  plugins: [stencilPlugin()],
});
```

The plugin supports `@Component({ tag })`, `@Prop()` and `@Event()` metadata, including custom prop attributes, reflected props, and event names. It also auto-detects slots, parts, CSS custom properties, CSS states, and static events in class template literals and methods.

## Documenting Web Component APIs

Use the component and member JSDoc comments together with Stencil decorators:

```tsx
/**
 * A collapsible details panel.
 *
 * @summary Shows a heading and expandable content.
 * @slot - Panel content.
 * @slot heading - Custom heading content.
 * @event {CustomEvent} panel-toggle - Fired when expanded changes.
 * @cssprop [--details-panel-border-color=gray] - Border color.
 * @csspart panel - The panel wrapper.
 * @cssState expanded - The panel is open.
 */
@Component({ tag: "details-panel" })
export class DetailsPanel {
  /** Whether the panel is expanded. */
  @Prop({ reflect: true }) expanded = false;

  /** Heading text. */
  @Prop({ attribute: "heading" }) heading = "Details";

  /** Emitted when the panel opens or closes. */
  @Event({ eventName: "panel-toggle" }) panelToggle!: EventEmitter<boolean>;

  /** Toggles the panel. */
  toggle() {
    this.expanded = !this.expanded;
    this.panelToggle.emit(this.expanded);
  }
}
```

The example documents the following manifest APIs:

| Source | Manifest API |
|---|---|
| Component comment and `@Component` | `description`, `summary`, `tagName` |
| `@Prop()` and property JSDoc | `members` and `attributes` |
| Method JSDoc and signature | Member description, parameters, return type |
| `@Event()` and `@event` / `@fires` | `events` |
| `@slot` | `slots` |
| `@csspart` | `cssParts` |
| `@cssprop` | `cssProperties` |
| `@cssState` | `cssStates` |

Use `@Prop({ attribute: "...", reflect: true })` to document custom attribute
names and reflection. Use `@default`, `@deprecated`, or `@internal` in JSDoc
to refine the generated metadata. See
[Documenting Components](/guide/documenting/) for the complete tag reference.

## Automatic API Discovery

The plugin scans template literals and methods in the Stencil class:

```ts
someMethod() {
  const template = `
    <!-- Panel wrapper -->
    <div part="panel">
    
      <!-- Header content -->
      <slot name="header"></slot>

      <!-- Default content -->
      <slot></slot>
    </div>`;
  const styles = `:host { /** Panel color. */ --panel-color: gray; }`;
  document.dispatchEvent(new CustomEvent("panel-change"));
}
```

This detects default/named slots, CSS parts, CSS custom properties, literal
`.states.add("name")` CSS states, and static events. Dynamic names are skipped;
HTML comments immediately before slots or parts become their CEM descriptions;
CSS comments before custom property declarations become CSS property
descriptions. Use `@slot`, `@csspart`, `@cssprop`, `@cssState`, or `@event` /
`@fires` when explicit documentation is needed.
