---
title: Bundler Plugin
description: Generate custom-elements.json from Vite, Rollup, Rolldown, or Webpack.
---

`@wc-toolkit/cem-generator-bundler` runs `@wc-toolkit/cem-generator` as part of a bundler
build. It generates `custom-elements.json` before a production build and
reruns the generator when watched source files change.

## Installation

```bash
npm install -D @wc-toolkit/cem-generator-bundler
```

The package depends on `@wc-toolkit/cem-generator`. You do not need to install a
separate generator CLI.

## Vite

The Vite adapter also works with Rollup and Rolldown configurations:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { cemGeneratorPlugin } from "@wc-toolkit/cem-generator-bundler/vite";

export default defineConfig({
  plugins: [
    cemGeneratorPlugin(),
  ],
});
```

The plugin automatically discovers the first matching configuration file in
the bundler project root:

- `cem-generator.config.mjs`
- `cem-generator.config.js`
- `cem-generator.config.cjs`
- `cem-generator.config.ts`

If no config file is found, the generator runs with its defaults and analyzes
`tsconfig.json`.

For Rollup or Rolldown, use the same plugin in the respective configuration:

```ts
import { cemGeneratorPlugin } from "@wc-toolkit/cem-generator-bundler/vite";

export default {
  input: "src/index.ts",
  plugins: [cemGeneratorPlugin()],
};
```

The output path defaults to `custom-elements.json` in the bundler project
root. `tsConfigPath` defaults to `tsconfig.json` in that same root.

## Webpack

Webpack uses a class-based adapter:

```js
// webpack.config.js
const { CemGeneratorWebpackPlugin } = require(
  "@wc-toolkit/cem-generator-bundler/webpack"
);

module.exports = {
  plugins: [
    new CemGeneratorWebpackPlugin({
      output: "dist/custom-elements.json",
      watchPaths: ["src"],
    }),
  ],
};
```

Use `watchPaths` when analyzed source files are not imported by a Webpack
entry point. These paths are registered with Webpack's file watcher.

## Configuration

The plugin accepts the core generator options, plus bundler-specific options:

| Option | Default | Description |
| --- | --- | --- |
| `config` | auto-discovered | Path to `cem-generator.config.mjs`, `.js`, `.cjs`, or `.ts` |
| `tsConfigPath` | `tsconfig.json` | TypeScript configuration used for analysis |
| `output` | `custom-elements.json` | Manifest output path |
| `include` | all program files | File patterns to analyze |
| `exclude` | none | File patterns to skip |
| `plugins` | none | Core detector and annotator plugins |
| `inheritance` | enabled | Inheritance materialization options |
| `debounceMs` | `120` | Watch rerun debounce delay |
| `runInServe` | `true` | Run on Vite dev-server startup and changes |
| `watchPaths` | none | Extra paths registered by the Webpack adapter |

For larger generator configurations, use the auto-discovered config file:

```ts
// cem-generator.config.ts
import { myFrameworkPlugin } from "./tools/my-framework-plugin.js";

export default {
  include: ["src/**/*.ts"],
  exclude: ["src/**/*.test.ts", "src/**/*.stories.ts"],
  plugins: [myFrameworkPlugin()],
};
```

Then keep the bundler configuration focused on integration:

```ts
cemGeneratorPlugin({ output: "dist/custom-elements.json" });
```

You can choose between three configuration approaches:

1. **Auto-discovery** — place `cem-generator.config.{mjs,js,cjs,ts}` in the
   bundler project root and call `cemGeneratorPlugin()`.
2. **Explicit config path** — pass `config` when the file is elsewhere:

   ```ts
   cemGeneratorPlugin({ config: "config/cem-generator.ts" });
   ```

   Relative paths are resolved from the bundler root.
3. **Inline options** — configure the generator directly in the bundler
   configuration when a separate config file is unnecessary:

   ```ts
    cemGeneratorPlugin({
      include: ["src/**/*.ts"],
     output: "dist/custom-elements.json",
   });
   ```

The config file uses a default export and can import plugins or other helper
modules. Inline options take precedence over values loaded from the config
file.

## Watch behavior

- Production builds generate the manifest once at build start.
- Vite serve mode generates on startup and on added, changed, or removed
  source files.
- Rollup and Rolldown watch mode rerun through the `watchChange` hook.
- Webpack watch mode reruns when changed files match a source extension or a
  generator config file.
- Changes to `custom-elements.json` never trigger another generation.

Use `runInServe: false` to generate only during Vite/Rollup/Rolldown builds.

## Output

The plugin writes a formatted CEM 2.1.0 manifest and creates the output
directory when needed. Generation errors fail a build hook; watch-mode errors
are reported through the bundler logger.
