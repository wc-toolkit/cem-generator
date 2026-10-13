---
title: Programmatic API
description: Generate and watch Custom Elements Manifests from JavaScript or TypeScript.
---

Use `@wc-toolkit/cem-generator` when generation belongs inside a build script,
development server, or other Node.js application.

## One-shot generation

`generateCem()` reads the configured TypeScript project, analyzes its source, and
returns a Custom Elements Manifest.

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import fs from "node:fs";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  include: ["src/**/*.{ts,tsx}"],
  sort: true,
});

fs.writeFileSync("custom-elements.json", JSON.stringify(manifest, null, 2) + "\n");
```

The returned object is a CEM 2.1.0 package. `generateCem()` is synchronous and
creates one shared TypeScript program for that generation.

## Plugins

Pass detector or annotator plugins through `plugins`:

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { litPlugin } from "@wc-toolkit/cem-generator-lit";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [litPlugin()],
});
```

See [Creating Plugins](/plugins/creating-plugins/) for plugin lifecycle hooks
and fragment contracts.

## Reusable Sessions

Use `createGeneratorSession()` when the same project will be generated more than
once. The session retains the previous TypeScript program so later generations
can reuse TypeScript's project state.

```ts
import { createGeneratorSession } from "@wc-toolkit/cem-generator";

const session = createGeneratorSession({
  tsConfigPath: "./tsconfig.json",
});

const firstManifest = session.generate();
const nextManifest = session.generate();

session.close();
```

Call `session.close()` when the session is no longer needed. It is safe to call
it even when no watch is active.

## Watch Mode

`session.watch()` performs an initial generation, then watches source files and
regenerates after changes. The initial manifest is available through both
`onManifest` and the returned `ready` promise.

```ts
import { createGeneratorSession } from "@wc-toolkit/cem-generator";
import fs from "node:fs";

const session = createGeneratorSession({
  tsConfigPath: "./tsconfig.json",
});

const watch = session.watch({
  debounceMs: 120,
  onManifest(manifest) {
    fs.writeFileSync("custom-elements.json", JSON.stringify(manifest, null, 2) + "\n");
  },
  onError(error) {
    console.error("CEM generation failed:", error);
  },
});

await watch.ready;

// Call this when the host application shuts down.
watch.close();
```

Watch behavior:

- The initial generation runs before `ready` resolves.
- Changes to JavaScript, TypeScript, and CSS source files trigger regeneration.
- Changes are debounced by 120ms by default.
- The TypeScript program is reused between generations.
- `watch.close()` stops the file watcher; `session.close()` also stops it.
- A failed initial generation rejects `ready`; later failures go to `onError`.

The watch API is intended for long-running Node.js processes. For Vite,
Rollup, Rolldown, and Webpack projects, prefer the
[bundler plugin](/guide/bundler/) so the bundler owns file watching and
invalidation.
