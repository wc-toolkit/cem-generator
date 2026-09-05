---
title: Installation
description: Install and set up cem-generator in a component library project.
---

Get started generating a CEM in minutes by following these steps.

## Install the core package

```bash
npm install -D @cem-generator/core
```

## Set up a tsconfig

Ensure your project has a `tsconfig.json` that includes the source files for analysis. If you use path aliases, make sure they are configured so the TypeScript program can resolve types correctly.

## Run the generator

Pass a config object to `generateCem`. The `tsConfigPath` option defaults to `./tsconfig.json` if not provided:

```ts
import { generateCem } from "@cem-generator/core";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [litPlugin()],
});
```

This writes a manifest with CEM 2.1.0 schema output.

## Add framework plugins (optional)

For Lit projects, install and pass the Lit plugin:

```bash
npm install -D @cem-generator/plugin-lit
```

```ts
import { generateCem } from "@cem-generator/core";
import { litPlugin } from "@cem-generator/plugin-lit";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [litPlugin()],
});
```

## Verify the output

The manifest includes:
- modules and declarations,
- class members, attributes, events, slots,
- CSS custom properties and CSS parts,
- inherited APIs resolved automatically.

## CLI

For zero-config generation from the command line, see the [CLI](/cli/) reference.

## Next steps

- See [Architecture](/guide/architecture/) for how the core works.
- See [Pipeline](/guide/pipeline/) for `generateCem()` options and built-in inheritance.
- See [Inheritance](/guide/inheritance/) for omitting inherited APIs and using external manifests.
- See [Plugin System](/guide/plugins/) for custom detectors and annotators.