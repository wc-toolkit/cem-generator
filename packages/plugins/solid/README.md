# @wc-toolkit/cem-generator-solid

Solid Element detector plugin for components registered with
`solid-element`'s `customElement` function.

```ts
import { solidPlugin } from "@wc-toolkit/cem-generator-solid";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [solidPlugin()],
});
```

The plugin detects `customElement(tag, defaultProps, template)` calls, maps
default and typed template props to members and hyphenated attributes, and
preserves standard component JSDoc metadata. Solid JSX slots and `part`
attributes, CSS custom properties in template literals, and static
`Event`/`CustomEvent` dispatches are also auto-detected.

Run the included demo with `pnpm demo:solid`. It writes the generated manifest
to `demo/custom-elements.json`.
