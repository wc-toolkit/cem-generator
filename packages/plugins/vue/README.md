# @wc-toolkit/cem-generator-vue

Vue detector plugin for custom elements created with `defineCustomElement`.

```ts
import { vuePlugin } from "@wc-toolkit/cem-generator-vue";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [vuePlugin()],
});
```

The plugin detects `customElements.define` registrations and extracts Vue
`props` and `emits` metadata.

Run the included demo with `pnpm demo:vue`. It writes the generated manifest
to `demo/custom-elements.json`.
