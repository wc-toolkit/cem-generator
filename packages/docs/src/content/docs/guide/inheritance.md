---
title: Inheritance
description: Built-in inheritance materialization and omission controls.
---

Inheritance is built into `generateCem()` by default.

## Default behavior

- Resolves superclass chains after all files are analyzed.
- Merges inheritable APIs into subclass declarations.
- Marks inherited entries with `inheritedFrom` metadata.
- Throws on circular superclass chains.

## Inheritable collections

- `members`
- `attributes`
- `cssProperties`
- `cssParts`
- `cssStates`
- `slots`
- `events`

## Omit controls

Omissions apply to inherited items only.

- JSDoc class tags parsed into `omitInherited`:
  - `@omit`
  - `@omit-method`
  - `@omit-attr` / `@omit-attribute`
  - `@omit-event`
  - `@omit-cssprop` / `@omit-cssproperty`
  - `@omit-part` / `@omit-csspart`
  - `@omit-cssstate`
  - `@omit-slot`
- Pipeline options:
  - `omitByKind`
  - `omitByClassName`
  - `metadataField`

## External manifests

Use external manifests when superclass APIs are defined in other packages.

```ts
generateCem({
  inheritance: {
    externalManifests: [externalCem],
    includeExternalManifests: true,
  },
});
```

- `externalManifests`: used to resolve inherited superclass data.
- `includeExternalManifests`: appends external declarations/modules to final output.
```