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
