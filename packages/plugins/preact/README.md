# @wc-toolkit/cem-generator-preact

Preact detector plugin for components registered with `preact-custom-element`.

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { preactPlugin } from "@wc-toolkit/cem-generator-preact";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [preactPlugin()],
});
```

The plugin detects `register(Component, "tag-name", ["attribute"])`, maps typed
function props to manifest members, and links observed attributes to those members.

Run the included demo with `pnpm demo:preact`. It writes the generated manifest
to `demo/custom-elements.json`.
