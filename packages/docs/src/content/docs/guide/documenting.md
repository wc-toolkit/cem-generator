---
title: Documenting Components
description: JSDoc tags and patterns to capture component metadata in the manifest.
---

The manifest is built from TypeScript source + JSDoc. Document your components with these tags to get rich metadata.

## Class-level Tags

```ts
/**
 * A card-style container component.
 *
 * @summary Displays content in a styled card with header and body.
 * @tagName my-card
 * @deprecated Use <my-card-v2> instead.
 * @omitInherited  // When used on superclass, omits inherited APIs from subclasses
 */
export class MyCard extends LitElement {
  // ...
}
```

| Tag | Manifest Field | Description |
|-----|----------------|-------------|
| `@summary` | `summary` | One-line description (shown in lists) |
| `@description` | `description` | Full description (shown in detail) |
| `@tagName` | `tagName` | Custom element tag (auto-detected from `customElements.define`) |
| `@deprecated` | `deprecated` | Mark as deprecated (boolean or message) |
| `@omitInherited` | (internal) | On superclass: omits inherited APIs from subclasses |

## Members (Fields & Methods)

```ts
export class MyButton extends LitElement {
  /**
   * The button's visual variant.
   * @type {'primary' | 'secondary' | 'outline'}
   * @default 'primary'
   * @attr variant
   */
  @property() variant: 'primary' | 'secondary' | 'outline' = 'primary';

  /**
   * Internal pressed state.
   * @private
   * @internal
   */
  @state() private pressed = false;

  /**
   * Handles click and emits event.
   * @fires my-button-click
   * @event my-button-click
   * @param event - The click event
   * @returns Whether the click was handled
   */
  private handleClick(event: MouseEvent): boolean {
    this.dispatchEvent(new CustomEvent('my-button-click'));
    return true;
  }
}
```

| Tag | Manifest Field | Applies To |
|-----|----------------|------------|
| `@type` | `type.text` | Fields, parameters, returns |
| `@default` | `default` | Fields |
| `@attr` / `@attribute` | `attributes[].fieldName` | Fields (maps property to attribute) |
| `@readonly` | `readonly: true` | Fields |
| `@private` / `@internal` | `privacy: "private"` | Fields, methods |
| `@protected` | `privacy: "protected"` | Fields, methods |
| `@deprecated` | `deprecated` | Fields, methods |
| `@summary` | `summary` | Fields, methods |
| `@description` | `description` | Fields, methods |
| `@param` | `parameters[]` | Methods |
| `@returns` / `@return` | `return` | Methods |
| `@fires` / `@event` | `events[]` | Class, methods |
| `@fires` with type | `events[].type` | Methods |

## Attributes

For vanilla components, attributes are auto-detected from `observedAttributes`. For Lit, use `@attr`:

```ts
/** Button variant. @attr variant */
@property() variant = 'primary';

/** Disabled state. @attr disabled */
@property({ type: Boolean, reflect: true }) disabled = false;

/** ARIA label. @attr aria-label */
@property({ attribute: 'aria-label' }) ariaLabel = '';
```

| Tag | Result |
|-----|--------|
| `@attr` | Adds to `attributes[]` with same name |
| `@attr name` | Maps property to attribute `name` |
| `@attribute` | Same as `@attr` |

## Events

```ts
/**
 * Fired when the button is clicked.
 * @event my-button-click
 * @type {CustomEvent<{ value: string }>}
 */
@property() value = '';

// Or on a method:
/**
 * Submits the form.
 * @fires submit
 * @type {Event}
 */
submit() { /* ... */ }
```

| Tag | Manifest Field |
|-----|----------------|
| `@event name` | `events[].name` |
| `@fires name` | Same as `@event` |
| `@type {EventType}` | `events[].type.text` |

## Slots

```ts
/**
 * @slot default - Main content
 * @slot header - Header content
 * @slot footer - Footer content (optional)
 */
export class MyCard extends LitElement {
  render() {
    return html`
      <header><slot name="header"></slot></header>
      <main><slot></slot></main>
      <footer><slot name="footer"></slot></footer>
    `;
  }
}
```

| Tag | Manifest Field |
|-----|----------------|
| `@slot name - description` | `slots[]` with `name` and `description` |

## CSS Custom Properties

```ts
/**
 * @cssprop --my-card-bg - Background color
 * @cssprop --my-card-padding - Internal padding (default: 16px)
 * @cssprop --my-card-radius - Border radius (syntax: <length>)
 */
export class MyCard extends LitElement {
  static styles = css`
    :host {
      background: var(--my-card-bg, white);
      padding: var(--my-card-padding, 16px);
      border-radius: var(--my-card-radius, 8px);
    }
  `;
}
```

| Tag | Manifest Field |
|-----|----------------|
| `@cssprop --name - description` | `cssProperties[]` |
| `@cssprop --name - desc (default: value)` | Adds `default` |
| `@cssprop --name - desc (syntax: <type>)` | Adds `syntax` |

## CSS Parts

```ts
/**
 * @csspart container - Main wrapper
 * @csspart header - Header section
 * @csspart body - Content area
 */
export class MyCard extends LitElement {
  render() {
    return html`
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

```ts
/**
 * @cssstate expanded - Whether the panel is expanded
 * @cssstate loading - Whether content is loading
 */
export class MyPanel extends LitElement {
  @state() expanded = false;
  @state() loading = false;

  render() {
    return html`
      <div part="panel" exportparts="panel">
        <slot></slot>
      </div>
    `;
  }
}
```

| Tag | Manifest Field |
|-----|----------------|
| `@cssstate name - description` | `cssStates[]` |

## Complete Example

```ts
/**
 * A versatile button component.
 *
 * @summary Clickable button with variants and states.
 * @tagName my-button
 * @fires click - Native click event
 * @fires my-button-press - Custom press event
 * @cssprop --my-button-bg - Background color
 * @cssprop --my-button-fg - Text color (syntax: <color>)
 * @csspart button - The native button element
 * @csspart icon - Icon slot wrapper
 */
export class MyButton extends LitElement {
  /** Visual style variant. @attr variant */
  @property({ reflect: true })
  variant: 'primary' | 'secondary' = 'primary';

  /** Disabled state. @attr disabled */
  @property({ type: Boolean, reflect: true })
  disabled = false;

  /** Loading state. @attr loading */
  @property({ type: Boolean, reflect: true })
  loading = false;

  /** @internal */
  @state() private pressed = false;

  /**
   * Click handler.
   * @fires my-button-press
   * @param event - Click event
   * @returns void
   */
  private onClick(event: MouseEvent) {
    if (this.disabled) return;
    this.dispatchEvent(new CustomEvent('my-button-press', { detail: event }));
  }

  render() {
    return html`
      <button
        part="button"
        class=${this.variant}
        ?disabled=${this.disabled}
        @click=${this.onClick}
      >
        <span part="icon"><slot name="icon"></slot></span>
        <span><slot></slot></span>
      </button>
    `;
  }
}
```

## Type Annotations

For better type information in the manifest, use TypeScript types alongside JSDoc:

```ts
/** @type {string} */
@property() name = '';

/** @type {'a' | 'b' | 'c'} */
@property() mode = 'a';

/** @type {number} */
@property({ type: Number }) count = 0;
```

The parser extracts TypeScript types when available, falling back to `@type` JSDoc tags.

## Next steps

- [Overview](/guide/overview/) — Getting started
- [Configuration](/guide/configuration/) — All options
- [Pipeline](/guide/pipeline/) — How detection works