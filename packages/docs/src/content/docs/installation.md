---
title: Installation
description: Install and set up cem-generator in a component library project.
---

Get started generating a CEM in minutes by following these steps.

## Install the core package

```bash
npm install -D @wc-toolkit/cem-generator
```

## Run the generator

Pass a config object to `generateCem`:

```ts
import { generateCem } from "@wc-toolkit/cem-generator";

const manifest = generateCem();
```

This writes a manifest with CEM 2.1.0 schema output.

## Add framework plugins (optional)

Framework-specific detection is opt-in via plugins. Install the plugin you need and pass it to `generateCem`:

```ts
import { generateCem } from "@wc-toolkit/cem-generator";

const manifest = generateCem({
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
