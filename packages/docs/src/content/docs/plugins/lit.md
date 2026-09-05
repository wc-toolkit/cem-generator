---
title: Lit Plugin
description: Reference detector plugin for Lit projects.
---

@cem-generator/plugin-lit demonstrates framework-specific detection on top of core.

## Detects

- classes extending `LitElement`
- decorated fields from `@property(...)` and `@state(...)`
- class JSDoc tags (`@tag`, `@event`, `@cssprop`, etc.)
- CSS custom properties from:
  - `:host { --token: value; }`
  - `@property --token { syntax: ...; initial-value: ... }`
- CSS parts from template `part="..."` attributes

## Rules

- does not auto-document `var(--token)` usage-only references
- JSDoc can enrich or override detected CSS part/property descriptions

## Usage

```ts
import { generateCem } from "@cem-generator/core";
import { litPlugin } from "@cem-generator/plugin-lit";

const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  plugins: [litPlugin()],
});
```