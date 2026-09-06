# @cem-generator/plugin-lit

Reference Lit detector plugin for developers and agents extending `cem-generator`.

## Who should use this

- Teams analyzing Lit-based web components
- Plugin authors who want a concrete detector implementation to copy
- Agents generating or validating plugin behavior against real AST patterns

## What this plugin detects

- Classes extending `LitElement`
- Decorated members from `@property(...)` and `@state(...)`
- CSS custom properties defined in `:host { --token: ... }`
- CSS `@property --token { syntax: ...; initial-value: ... }` metadata
- JSDoc for CSS properties from class tags and comments above CSS declarations

## Usage

```ts
import { generateCem } from "@cem-generator/core";
import { litPlugin } from "@cem-generator/plugin-lit";

const manifest = generateCem({
  projectTsconfigPath: "./tsconfig.json",
  plugins: [litPlugin()],
});
```

## Examples

```ts
import { LitElement, css } from "lit";

class TokenExample extends LitElement {
  static styles = css`
    /** Surface color token contract. */
    @property --surface-color {
      syntax: "<color>";
      initial-value: teal;
      inherits: false;
    }

    :host {
      /** Gap token used by the host wrapper. */
      --host-gap: 8px;
    }

    .inner {
      color: var(--surface-color);
      gap: var(--host-gap);
      /* --usage-only is NOT auto-documented */
      border-color: var(--usage-only, red);
    }
  `;
}
```

Expected CSS property output shape:

```json
[
  {
    "name": "--surface-color",
    "syntax": "<color>",
    "default": "teal",
    "description": "Surface color token contract."
  },
  {
    "name": "--host-gap",
    "default": "8px",
    "description": "Gap token used by the host wrapper."
  }
]
```

`cssPart` discovery from markup:

```ts
/**
 * @csspart icon - Styles the icon slot
 */
render() {
  return html`<button part="button"><span part="icon button"></span></button>`;
}
```

Expected part behavior:

- `button` is documented from `part="button"` even without JSDoc.
- `icon` is documented and gets description from `@csspart icon - ...`.

You can also add a template HTML comment immediately before the element
containing `part="..."` to provide fallback part documentation:

```ts
render() {
  return html`
    <!-- Primary button chrome -->
    <button part="button"><span part="icon button"></span></button>
  `;
}
```

If `@csspart button` exists, that JSDoc description still wins.

More real fixtures are in `examples/fixtures/my-button.ts` and
`examples/fixtures/my-card.ts`.

## Agent notes

- Keep `claims()` cheap; this plugin uses text checks before AST work.
- Return class fragments only; leave global enrichment to annotators.
- Treat this as a minimal reference implementation, not full Lit parity.

## CSS Property Rules

- `var(--token)` usages are not auto-documented.
- Auto-capture happens only for declarations in `:host` and `@property` definitions.
- JSDoc `@cssprop` and `@cssproperty` tags are merged with detected CSS metadata.
