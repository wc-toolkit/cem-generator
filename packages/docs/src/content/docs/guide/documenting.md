---
title: Documenting Components
description: JSDoc tags and patterns to capture component metadata in the manifest.
---

The manifest is built from TypeScript source + JSDoc. Document your components with these tags to get rich metadata. The tags described here are framework-agnostic — they work with any component, whether vanilla or built with a framework plugin.

## Class-level Tags

```ts
/**
 * A card-style container component.
 *
 * @summary Displays content in a styled card with header and body.
 * @tag my-card
 * @deprecated Use <my-card-v2> instead.
 */
export class MyCard extends HTMLElement {
  // ...
}
```

| Tag | Manifest Field | Description |
|-----|----------------|-------------|
| `@summary` | `summary` | One-line description (shown in lists) |
| (comment body) | `description` | Full description (the block's free-text description) |
| `@tag` / `@tagname` | `tagName` | Custom element tag (also auto-detected from `customElements.define`) |
| `@deprecated` | `deprecated` | Mark as deprecated (boolean or message) |

### Omitting inherited APIs

Put the omit tags on a **subclass** to exclude specific inherited APIs from its materialized output:

```ts
/**
 * @omit-method baseMethod
 * @omit-attribute base-count
 * @omit-cssprop --base-token
 * @omit-event base-event
 */
export class ChildCard extends MyCard {}
```

| Tag | Omits |
|-----|-------|
| `@omit` | Inherited `members` and `attributes` |
| `@omit-method` | Inherited members (methods) |
| `@omit-attribute` / `@omit-attr` | Inherited attributes |
| `@omit-cssprop` / `@omit-cssproperty` | Inherited CSS custom properties |
| `@omit-part` / `@omit-csspart` | Inherited CSS shadow parts |
| `@omit-cssState` / `@omit-cssstate` | Inherited CSS custom states |
| `@omit-event` | Inherited events |
| `@omit-slot` | Inherited slots |


## Members (Fields & Methods)

```ts
export class MyButton extends HTMLElement {
  /**
   * The button's visual variant.
   * @attr variant
   */
  variant: 'primary' | 'secondary' | 'outline' = 'primary';

  /**
   * Internal pressed state.
   * @internal
   */
  private pressed = false;

  /**
   * Handles click and emits event.
   * @deprecated Use handleActivate instead.
   */
  private handleClick(event: MouseEvent): boolean {
    this.dispatchEvent(new CustomEvent('my-button-click'));
    return true;
  }
}
```

Member JSDoc tags:

| Tag | Manifest Field | Notes |
|-----|----------------|-------|
| `@attr` / `@attribute` | `attributes[].fieldName` | Maps the member to an attribute |
| `@default` | `default` | Default value. Optional — auto-detected from the member's initializer; `@default` overrides it |
| `@internal` / `@ignore` | (omitted) | Drops the member from output |
| `@reflect` | `reflects: true` | Marks the attribute as reflected |
| `@summary` | `summary` | One-line description |
| `@deprecated` | `deprecated` | Mark as deprecated (boolean or message) |

Field and method types, parameters, returns and privacy come from the TypeScript declaration itself — they don't need JSDoc:

- `privacy` — from the `private` / `protected` / `public` keyword; `#`-prefixed ES private fields/methods are also included with `privacy: "private"`
- `readonly` — from the `readonly` keyword
- `parameters` / `return` — from the method signature and its annotations

## Attributes

For vanilla components, attributes are auto-detected from `observedAttributes`. You can also map a property to an attribute using `@attr`:

```ts
/**
 * Button variant.
 * @attr variant
 */
variant = 'primary';

/**
 * Disabled state.
 * @attr disabled
 */
disabled = false;

/**
 * ARIA label.
 * @attr aria-label
 */
ariaLabel = '';
```

| Tag | Result |
|-----|--------|
| `@attr` | Adds to `attributes[]` with same name |
| `@attr name` | Maps property to attribute `name` |
| `@attribute` | Same as `@attr` |

## Events

Declare events with class-level `@fires` / `@event` tags on the component class:

```ts
/**
 * @fires my-button-click - Fired when the button is clicked
 * @event {CustomEvent<{ value: string }>} my-button-value - Fired on value change
 */
export class MyButton extends HTMLElement {
  // ...
}
```

| Tag | Manifest Field |
|-----|----------------|
| `@event name` | `events[].name` |
| `@event {Type} name` | `events[].name` + `events[].type` |
| `@fires name` | Same as `@event` |
| `@fires {Type} name` | Same as `@event` with a type |

## Slots

Slot elements in template literals are auto-discovered. This includes template literals in the class body (e.g. inside `connectedCallback` or a `render()` method) and module-level template literals in the same file. An HTML comment immediately before a `<slot>` tag becomes its description:

```ts
<!-- Module-level slot -->
const template = `
  <div part="card">
    <!-- Main content -->
    <slot></slot>
    <!-- Header content -->
    <slot name="header"></slot>
  </div>
`;

export class MyCard extends HTMLElement {
  connectedCallback() {
    this.innerHTML = template;
  }
}
```

A comment only describes the element it immediately precedes. A `<slot>` nested inside another element won't take the comment that describes its parent:

```ts
const template = `
  <!-- Header section -->
  <header part="header"><slot name="header"></slot></header>
`;
```

Here `part="header"` gets the "Header section" description; the inner `header` slot does not.

You can also declare slots with class-level `@slot` tags. Use a leading dash (`@slot - ...`) for the unnamed default slot. Explicit `@slot` tags take precedence over auto-discovered descriptions:

```ts
/**
 * @slot - Main content
 * @slot header - Header content
 * @slot footer - Footer content (optional)
 */
export class MyCard extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <header><slot name="header"></slot></header>
      <main><slot></slot></main>
      <footer><slot name="footer"></slot></footer>
    `;
  }
}
```

| Tag | Manifest Field |
|-----|----------------|
| `@slot - description` | `slots[]` with `name: ""` and `description` (default slot) |
| `@slot name - description` | `slots[]` with `name` and `description` |

## CSS Custom Properties

CSS custom properties are auto-detected from template literals in the class body (e.g. a `<style>` block in `connectedCallback` or a `render()` method) and module-level template literals in the same file, via two constructs:

1. **CSS `@property` rules** — record the token `name`, `initial-value` as the `default`, `syntax`, and any preceding `/** */` comment as the `description`.
2. **Declarations under `:host`** — record the token `name`, the value as the `default`, and any preceding `/** */` comment as the `description`. A `:host` declaration is **only** captured when it has a `/** */` comment; un-commented declarations are ignored.

```ts
export class MyCard extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <style>
        :host {
          /** Host text color token. */
          --my-card-bg: steelblue;
          --my-card-padding: 16px; /* ignored: no /** */ comment */
        }

        /** Foreground token contract. */
        @property --my-card-fg {
          syntax: "<color>";
          initial-value: white;
        }
      </style>
      <slot></slot>
    `;
  }
}
```

You can also declare CSS custom properties with class-level `@cssprop` / `@cssproperty` tags. Use the bracket form `[--token=default]` to record a default value:

```ts
/**
 * @cssprop --my-card-bg - Background color
 * @cssprop [--my-card-padding=16px] - Internal padding
 * @cssprop [--my-card-radius=8px] - Border radius
 */
export class MyCard extends HTMLElement {
  // ...
}
```

| Tag | Manifest Field |
|-----|----------------|
| `@cssprop --name - description` | `cssProperties[]` with `name` and `description` |
| `@cssprop [--name=default] - description` | Adds `default` alongside `name` and `description` |
| `@cssproperty ...` | Same as `@cssprop` |

Explicit `@cssprop` tags take precedence over auto-detected descriptions and defaults for the same token.

## CSS Parts

`part="..."` attributes in template literals (class body or module-level) are auto-discovered. An HTML comment immediately before the element with the `part` attribute becomes its description:

```ts
<!-- Module-level chrome -->
const template = `
  <div part="container">
    <!-- Header section -->
    <header part="header">
      <slot name="header"></slot>
    </header>
    <main part="body">
      <slot></slot>
    </main>
  </div>
`;

export class MyCard extends HTMLElement {
  connectedCallback() {
    this.innerHTML = template;
  }
}
```

You can also declare CSS parts with class-level `@csspart` tags. Explicit `@csspart` tags take precedence over auto-detected descriptions:

```ts
/**
 * @csspart container - Main wrapper
 * @csspart header - Header section
 * @csspart body - Content area
 */
export class MyCard extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div part="container">
        <header part="header"><slot name="header"></slot></header>
        <main part="body"><slot></slot></main>
      </div>
    `;
  }
}
```

| Tag | Manifest Field |
|-----|----------------|
| `@csspart name - description` | `cssParts[]` |

## CSS Custom States

CSS custom states are declared through the [ElementInternals](https://developer.mozilla.org/en-US/docs/Web/API/ElementInternals) `states` API (`CustomStateSet`). Custom states passed to `.states.add("...")` are auto-detected:

```ts
export class MyPanel extends HTMLElement {
  #internals;

  constructor() {
    super();
    this.#internals = this.attachInternals();
    this.#internals.states.add("initialized");
  }

  set loading(value: boolean) {
    if (value) {
      this.attachInternals().states.add("loading");
    } else {
      this.attachInternals().states.delete("loading");
    }
  }
}
```

You can also declare CSS custom states with class-level `@cssState` tags. Explicit `@cssState` tags take precedence over auto-detected names:

```ts
/**
 * @cssState expanded - Whether the panel is expanded
 * @cssState loading - Whether content is loading
 */
export class MyPanel extends HTMLElement {
  #internals;

  constructor() {
    super();
    this.#internals = this.attachInternals();
  }

  get expanded() {
    return this.#internals.states.has("expanded");
  }

  set expanded(value: boolean) {
    value ? this.#internals.states.add("expanded") : this.#internals.states.delete("expanded");
  }
}
```

| Tag | Manifest Field |
|-----|----------------|
| `@cssState name - description` | `cssStates[]` |

## Complete Example

```ts
/**
 * A versatile button component.
 *
 * @summary Clickable button with variants and states.
 * @tag my-button
 * @fires click - Native click event
 * @fires my-button-press - Custom press event
 * @cssprop --my-button-bg - Background color
 * @cssprop [--my-button-fg=white] - Text color
 * @csspart button - The native button element
 * @csspart icon - Icon slot wrapper
 */
export class MyButton extends HTMLElement {
  static get observedAttributes() {
    return ['variant', 'disabled', 'loading'];
  }

  /**
   * Visual style variant.
   * @attr variant
   */
  variant: 'primary' | 'secondary' = 'primary';

  /**
   * Disabled state.
   * @attr disabled
   */
  disabled = false;

  /**
   * Loading state.
   * @attr loading
   */
  loading = false;

  /** @internal */
  private pressed = false;

  /**
   * Click handler.
   * @param event - Click event
   * @returns void
   */
  private onClick(event: MouseEvent) {
    if (this.disabled) return;
    this.dispatchEvent(new CustomEvent('my-button-press', { detail: event }));
  }

  connectedCallback() {
    this.innerHTML = `
      <button
        part="button"
        class="${this.variant}"
        ?disabled="${this.disabled}"
      >
        <span part="icon"><slot name="icon"></slot></span>
        <span><slot></slot></span>
      </button>
    `;
    this.querySelector('button')?.addEventListener('click', this.onClick);
  }
}
```

## Type Annotations

Types are read from the TypeScript declaration — the type annotation if present, otherwise the TypeChecker's inferred type at the member:

```ts
export class MyElement extends HTMLElement {
  name: string = '';

  variant: 'primary' | 'secondary' | 'outline' = 'primary';

  count = 0; // inferred as number
}
```

For untyped JavaScript members (with `checkJs`/`allowJs`), JSDoc `@type` annotations are honored:

```ts
/** @type {'a' | 'b' | 'c'} */
mode = 'a';
```

Class-level `@attr` / `@attribute` tags can also carry a type — e.g. `@attr {boolean} disabled - disables the element` — which flows into the emitted `attributes[].type`.

## Next steps

- [Overview](/guide/overview/) — Getting started
- [Configuration](/guide/configuration/) — All options
- [Creating Plugins](/plugins/creating-plugins/) — How detection and enrichment hooks work
