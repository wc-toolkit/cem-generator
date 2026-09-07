# @wc-toolkit/cem-generator-svelte

Svelte detector plugin for components compiled as custom elements with
`<svelte:options customElement="..." />`.

```ts
import { sveltePlugin } from "@wc-toolkit/cem-generator-svelte";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [sveltePlugin()],
});
```

The plugin analyzes `.svelte` files, extracting props, slots, parts, CSS
custom properties, static events, and component JSDoc metadata.

Run the included demo with `pnpm demo:svelte`. It writes the generated manifest
to `demo/custom-elements.json`.
