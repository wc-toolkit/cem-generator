# @wc-toolkit/cem-generator

## 0.1.4

### Patch Changes

- e60e512: Detect documented CSS-only custom elements in standalone stylesheets, including CSS custom properties, `@property` metadata, CSS-documented attributes, and inferred literal attribute value types.

## 0.1.3

### Patch Changes

- 0c4ccf1: Allow the CLI to use a manifest path from generator configuration, optionally
  add the generated manifest to `package.json` during initialization, and resolve
  runtime module paths correctly for packages nested in workspaces.
- c9b8d84: Preserve custom Lit and FAST superclass relationships and mark members
  inherited from those base classes with `inheritedFrom` metadata.

## 0.1.2

### Patch Changes

- cfdaf56: Add configurable type parsing modes: `public` by default, `all`, or `none`.
- 6cea3e9: Resolve CEM module paths through package exports and emit project-relative source paths.
- cfdaf56: Emit CEM module source paths relative to the project directory.
- cfdaf56: Bound parsed TypeScript expansion and support nested object types in JSDoc event tags without oversized output or malformed event names.
- Updated dependencies [cfdaf56]
- Updated dependencies [cfdaf56]
  - @wc-toolkit/cem-generator-utils@0.1.1

## 0.1.1

### Patch Changes

- 627703d: Rename the completion lifecycle plugin hook to `afterGenerate`.
