---
title: Svelte Plugin
description: Generate a Custom Elements Manifest for Svelte custom elements.
---

`@wc-toolkit/cem-generator-svelte` detects Svelte components compiled as
custom elements with `<svelte:options customElement="..." />`.

## Installation

```sh
pnpm add -D @wc-toolkit/cem-generator-svelte svelte
```

## Supported pattern

```svelte
<svelte:options customElement="greeting-element" />

<script lang="ts">
  /** Name shown by the greeting. */
  export let name: string = "World";
  export let count: number = 1;
</script>

<h1>Hello {name}</h1>
<slot />
```

The plugin analyzes `.svelte` files directly. The component filename becomes
the declaration name, and the `customElement` option supplies the tag name.

## Automatic API discovery

The plugin detects:

```svelte
<style>
  :host { 
    /** Accent color. */ 
    --greeting-color: steelblue; 
  }
</style>

<!-- Greeting label -->
<span part="label">
  <slot name="label"></slot>
</span>

<!-- Main content -->
<slot></slot>

<script>
  $host().dispatchEvent(new CustomEvent("greet"));
</script>
```

This creates metadata for the `label` part, named and default slots, the
`--greeting-color` CSS property, and the `greet` event. Comments immediately
before slots or parts become their CEM `description` fields. CSS comments
before custom property declarations become CSS property descriptions.

Static event names are required. Dynamic names should be documented with
`@event` or `@fires`.

## Props and attributes

Legacy `export let` props and Svelte 5 `$props()` destructuring are supported:

```svelte
<script lang="ts">
  interface CardProps {
    /** Card heading. */
    title: string;
    /** Whether the card is expanded. */
    expanded?: boolean;
  }

  let { title, expanded = false }: CardProps = $props();
</script>
```

Props become manifest members and attributes. Default values provide member
defaults and typed props provide member types and descriptions. Attributes use
lowercase prop names by default. Configure a custom attribute with the Svelte
custom-element options:

```svelte
<svelte:options customElement={{
  tag: "status-card",
  props: { status: { attribute: "card-status", reflect: true, type: "String" } }
}} />
```

## JSDoc metadata

Document the whole component with a comment immediately before
`<svelte:options>`:

```svelte
/**
 * A collapsible status card.
 * @summary Displays task status and details.
 * @deprecated Use status-panel instead.
 * @slot - Card content.
 * @event {CustomEvent} toggle - Fired when expanded changes.
 * @csspart card - The card wrapper.
 * @cssprop [--card-color=gray] - Card accent color.
 */
<svelte:options customElement="status-card" />
```

The plugin maps the comment body to `description` and supports `@summary`,
`@deprecated`, `@slot`, `@event`, `@fires`, `@csspart`, and `@cssprop`.

## Usage

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { sveltePlugin } from "@wc-toolkit/cem-generator-svelte";

const manifest = generateCem({
  plugins: [sveltePlugin()],
});
```

Run the repository demo with `pnpm demo:svelte` to generate
`packages/plugins/svelte/demo/custom-elements.json`.
