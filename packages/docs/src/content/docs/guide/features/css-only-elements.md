---
title: CSS-Only Custom Elements
description: Document custom elements that are defined by CSS without a JavaScript class.
---

The built-in CSS detector finds UNdefined custom elements that are intended to work without JavaScript. It scans project `.css` files and emits a CEM declaration
when a custom-element selector is preceded by a JSDoc-style comment.

## Documenting An Element

Put a JSDoc style comment (`/** ... */`) immediately before the selector:

```css
/**
 * A badge styled entirely with CSS.
 */
my-badge {
  /** Inner spacing. */
  --badge-padding: 4px;

  /** Surface color. */
  --badge-bg-color: lightgray;

  /** Text color. */
  --badge-fg-color: black;
}
```

The generated declaration uses `my-badge` as both its `name` and `tagName`, and
the selector comment becomes its `description`.

The element comment can also use `@cssprop` or `@cssproperty` tags. These tags
are merged into the generated `cssProperties` collection and override matching
values discovered from the stylesheet:

```css
/**
 * A documented badge.
 * @cssprop [--badge-padding=8px] - Override the default spacing.
 * @cssprop --badge-outline-color - Optional outline color.
 */
my-badge {
  /** Base spacing. */
  --badge-padding: 4px;
}
```

Selectors without a preceding JSDoc-style comment are ignored. A regular CSS
comment is not enough:

```css
/* Not detected. */
my-undocumented-element {
  --color: red;
}
```

## CSS Custom Properties

Custom-property declarations inside a CSS-only element must also have their own
preceding JSDoc-style comment. This prevents implementation-only variables from
being added to the public CEM API. Use `@cssprop` in the element comment for
documented properties that are not declared directly in the rule.

`@property` rules are always included when they declare a custom property. Their
`syntax` and `initial-value` are emitted as `syntax` and `default`; a preceding
JSDoc comment is emitted as the property's `description` when present.

```css
/** Corner radius. */
@property --badge-radius {
  syntax: "<length>";
  initial-value: 4px;
  inherits: false;
}
```

Nested variant rules can continue to override the element's styles without
changing the base metadata:

```css
my-badge {
  /** Base surface color. */
  --badge-bg-color: lightgray;

  &[variant="danger"] {
    --badge-bg-color: red;
  }
}
```

## Conservative Attribute Detection

The detector recognizes simple attribute selectors attached directly to the
custom-element selector, including nested `&[...]` selectors:

```css
/** A badge with variants. */
my-badge {
  &[variant="danger"] {
    --badge-bg-color: red;
  }
}
```

This emits an attribute named `variant`. Add `@attr` or `@attribute` to the
element comment to provide its description or other metadata:

```css
/**
 * A badge with variants.
 * @attr variant - Selects the badge style.
 */
my-badge[variant] {
  /** Base surface color. */
  --badge-bg-color: lightgray;
}
```

Exact values in simple selectors are combined into a string-literal union in
the attribute type. For example, `variant="danger"` and
`variant="success"` produce `"danger" | "success"`. Presence-only selectors
such as `[disabled]` do not produce an inferred type. An explicit type in an
`@attr {Type}` tag takes precedence.

Presence-only selectors are not automatically treated as booleans because CSS
presence matching does not define how the component interprets the value. If an
attribute is a boolean API, declare that explicitly:

```css
/**
 * A dismissible alert.
 * @attr {boolean} dismissible - Whether the alert can be dismissed.
 */
alert-box[dismissible] {
  display: block;
}
```

This emits `dismissible` with `type.text` set to `boolean`.

The conservative detector only handles simple attribute selectors attached to
the custom-element selector, or nested selectors beginning with `&`. Descendant
selectors and complex selector functions are intentionally not inferred.

## File Filtering

CSS files are scanned automatically when `include` is omitted or empty. If
`include` is provided, a CSS file must match one of its patterns. `exclude`
patterns always take precedence.

```ts
const manifest = generateCem({
  include: ["src/components/**"],
  exclude: ["**/*.test.css"],
});
```
