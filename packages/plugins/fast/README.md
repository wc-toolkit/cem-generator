# @wc-toolkit/cem-generator-fast

FAST detector plugin for `@microsoft/fast-element` components.

## Detects

- classes extending `FASTElement` or `FastElement`
- `@customElement("tag-name")` and `@customElement({ name: "tag-name" })`
- `@attr` fields and custom attribute names from `@attr({ attribute: "..." })`
- standard members, JSDoc metadata, and types through the core generator
- literal `$emit("event-name", detail)` calls as `CustomEvent` entries

FAST lifecycle and infrastructure members such as `connectedCallback`,
`disconnectedCallback`, `attributeChangedCallback`, `$fastController`, and
`$emit` are excluded from the public member list.

`mode: "boolean"` is accepted by FAST but requires no special CEM metadata; the field type remains the source of truth.

## Usage

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { fastPlugin } from "@wc-toolkit/cem-generator-fast";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [fastPlugin()],
});
```

Run the included demo with `pnpm demo:fast`. It writes the generated manifest to `demo/custom-elements.json`.
