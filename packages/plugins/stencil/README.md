# @wc-toolkit/cem-generator-stencil

Stencil detector plugin for `@stencil/core` components.

## Detects

- `@Component({ tag: "tag-name" })` classes
- `@Prop()` fields as members and attributes
- camelCase prop names converted to kebab-case attributes
- `attribute` and `reflects` prop options
- `@Event()` fields as events, including `eventName`
- standard members, JSDoc metadata, and types through the core generator
- Stencil lifecycle methods excluded from public members

## Usage

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { stencilPlugin } from "@wc-toolkit/cem-generator-stencil";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [stencilPlugin()],
});
```

Run the included demo with `pnpm demo:stencil`. It writes the generated manifest to `demo/custom-elements.json`.
