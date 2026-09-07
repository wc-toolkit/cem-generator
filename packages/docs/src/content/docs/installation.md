---
title: Installation
description: Install and set up cem-generator in a component library project.
---

Get started generating a CEM in minutes by following these steps.

## Install the core package

```bash
npm install -D @wc-toolkit/cem-generator
```

## Set up a tsconfig

Ensure your project has a `tsconfig.json` that includes the source files for analysis. If you use path aliases, make sure they are configured so the TypeScript program can resolve types correctly.

## Run the generator

Pass a config object to `generateCem`. The `tsConfigPath` option defaults to `./tsconfig.json` if not provided:

```ts
import { generateCem } from "@wc-toolkit/cem-generator";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
});
```

This writes a manifest with CEM 2.1.0 schema output.

## Add framework plugins (optional)

Framework-specific detection is opt-in via plugins. Install the plugin you need and pass it to `generateCem`:

```ts
import { generateCem } from "@wc-toolkit/cem-generator";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [myPlugin],
});
```

See the [Plugins](/plugins/) docs for available framework plugins and how to author your own.

## Verify the output

The manifest includes:
- modules and declarations,
- class members, attributes, events, slots,
- CSS custom properties and CSS parts,
- inherited APIs resolved automatically.

## CLI

For zero-config generation from the command line, see the [CLI](/guide/cli/) reference.

## Next steps

- See [Plugins](/plugins/) for how the core and plugin layers work.
- See [Creating Plugins](/plugins/creating-plugins/) for the pipeline lifecycle.
- See [Inheritance](/guide/features/inheritance/) for omitting inherited APIs and using external manifests.
- See [Plugins](/plugins/) for custom detectors and annotators.
