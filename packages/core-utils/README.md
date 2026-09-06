# @cem-generator/core-utils

Framework-agnostic helper package for developers and agents extending `cem-generator`.

## Who should use this

- Plugin authors who need shared JSDoc parsing behavior
- Core contributors implementing manifest post-processing
- Agents applying consistent inheritance and tag extraction rules

## What this package does

- Extracts JSDoc descriptions and named tags from TypeScript AST nodes
- Resolves inherited collections after all classes are present in the manifest

## Exports

- `getJSDocInfo`
- `getJSDocTagsNamed`
- `resolveInheritedCollection`

## Agent notes

- Prefer these helpers over re-implementing AST/JSDoc logic in each plugin.
- Run inheritance resolution only when the full manifest is available.
- Keep this package dependency-light and reusable across framework plugins.

## Inheritance behavior

`resolveInheritedCollection` resolves one collection through a superclass chain.
It supports `members`, `attributes`, `cssProperties`, `cssParts`, `cssStates`,
`slots`, and `events`.

- Own declarations are appended after inherited declarations.
- A same-named own declaration overrides the inherited declaration.
- Inherited entries receive `inheritedFrom` provenance.
- Missing superclass references contribute no inherited entries.
- Circular references throw instead of looping forever.
- `omit` removes matching inherited names only; it never removes own entries.

The resolver is intentionally a collection helper, not a TypeScript prototype
analyzer. Callers provide `findByRef`, so they decide how manifest references
and external manifests are indexed.
