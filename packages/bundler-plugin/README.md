# @cem-generator/bundler-plugin

Run `@cem-generator/core` from Vite, Rollup, Rolldown, or Webpack builds.

```ts
import { cemGeneratorPlugin } from "@cem-generator/bundler-plugin/vite";

export default {
  plugins: [
    cemGeneratorPlugin({
      tsConfigPath: "tsconfig.json",
      output: "dist/custom-elements.json",
    }),
  ],
};
```

The plugin generates once per build and reruns on source changes in watch or
dev-server mode. Use `CemGeneratorWebpackPlugin` from `/webpack` for Webpack;
its `watchPaths` option registers source directories that are not in the
Webpack module graph.
