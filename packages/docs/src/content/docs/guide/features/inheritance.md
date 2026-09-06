---
title: Inheritance
description: Built-in inheritance materialization and omission controls.
---

Inheritance is built into `generateCem()` and runs after all source files have
been analyzed. This means a subclass can inherit from a class declared in a
different module, and a multi-level chain is resolved in one pass.

## Default behavior

- Resolves superclass chains after all files are analyzed.
- Merges inheritable APIs into subclass declarations.
- Keeps subclass declarations after inherited entries in each collection.
- Lets a subclass override an inherited item by declaring the same `name`.
- Marks inherited entries with `inheritedFrom: { name, module? }` metadata.
- Throws on circular superclass chains.

If a superclass cannot be found in the generated manifest or supplied external
manifests, no inherited collection is added for that link. The superclass
reference remains in the declaration.

## Enable and disable

Inheritance is enabled with the default options object. Set it to `false` to
leave collections exactly as detectors produced them:

```ts
const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  inheritance: false,
});
```

The `include` option limits materialization to selected collection kinds. The
`ignore` option excludes kinds from that selection; `ignore` wins when both
options mention the same kind.

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

The shorthand `@omit` applies to both `members` and `attributes`. Omission
names are matched exactly, whitespace is trimmed, and an item declared directly
on the subclass is never removed by an omission rule. Omission configuration
is combined from the global kind map, the class-name map, and the declaration's
metadata field.

For example:

```ts
/**
 * @omit-method focus
 * @omit-slot label
 */
export class CompactButton extends Button {}
```

The equivalent declaration metadata is:

```ts
{
  omitInherited: {
    members: ["focus"],
    slots: ["label"],
  },
}
```

## External manifests

Use external manifests when superclass APIs are defined in other packages.
External manifests are supplied as already-loaded Custom Elements Manifest
objects:

```js
import { readFileSync } from "node:fs";

const externalCem = JSON.parse(
  readFileSync("./node_modules/@acme/components/custom-elements.json", "utf8")
);

generateCem({
  inheritance: {
    externalManifests: [externalCem],
  },
});
```

### Lookup versus output

These options control separate concerns:

- `externalManifests` indexes external declarations for superclass lookup. This
  is enough to materialize inherited members, attributes, events, slots, and CSS
  collections into local declarations.
- `includeExternalManifests` controls whether eligible external declarations
  and their modules are also appended to the returned manifest. It defaults to
  `false`.

Use lookup-only mode when consumers should see the inherited API on local
components but should not see the dependency's declarations duplicated in the
output:

```ts
generateCem({
  inheritance: {
    externalManifests: [externalCem],
    includeExternalManifests: false,
  },
});
```

Set `includeExternalManifests: true` when the output is intended to describe a
combined component library:

```ts
generateCem({
  inheritance: {
    externalManifests: [externalCem],
    includeExternalManifests: true,
  },
});
```

Only external declarations marked `customElement: true` or carrying a
`tagName` are appended. All declaration kinds can still participate in lookup
when they are referenced as a superclass.

### Matching superclass references

When a declaration has a module-qualified superclass reference, the resolver
first looks for the same class name and module path. If no exact module match
exists, it falls back to a name-only match. Keep the external manifest's module
`path` aligned with the `superclass.module` value emitted by the detector when
possible; this avoids ambiguous matches when packages export classes with the
same name.

External declarations can themselves have `superclass` references, so an
external base can provide a complete multi-level chain. Missing links are
ignored rather than treated as errors. Circular chains still throw.

`externalManifests` accepts manifest objects, not file names or URLs. Load those
files in the caller before passing them to `generateCem()`. When external
modules are included, declarations already present at the same `module#name`
key are not duplicated.

## Output example

Given `Button extends BaseButton`, an inherited member is represented like
this:

```json
{
  "name": "focus",
  "inheritedFrom": {
    "name": "BaseButton",
    "module": "./base-button.js"
  }
}
```

The same provenance is preserved through multiple levels, so an item inherited
by `Button` from `BaseButton` keeps its original `inheritedFrom` value when a
further subclass inherits it.

CSS parts and states are supported as collection types when detectors provide
them. They are not inferred from a component's runtime `render()` behavior.
