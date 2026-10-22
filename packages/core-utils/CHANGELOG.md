# @wc-toolkit/cem-generator-utils

## 0.1.6

### Patch Changes

- 176b325: Share literal-only initializer defaults across core, Solid, FAST, and Stencil. Computed expressions are no longer serialized as manifest defaults.

## 0.1.5

### Patch Changes

- 223c0e4: Standardize the workspace and published packages on the TypeScript 6 compiler API.

## 0.1.4

### Patch Changes

- 8fe821d: Read lowercase `@cssstate` JSDoc tags as CSS custom states and keep them out of custom tag output.
- 2fba859: Preserve valid JSDoc CSS custom property syntax annotations in generated manifests.

## 0.1.3

### Patch Changes

- 301a28c: Upgrade the workspace compiler to TypeScript 7 while retaining the TypeScript 6 compiler API compatibility package for AST and type analysis.

## 0.1.2

### Patch Changes

- 51cf06c: Update package documentation links and site branding for the custom CEM Generator domain.

## 0.1.1

### Patch Changes

- cfdaf56: Add configurable type parsing modes: `public` by default, `all`, or `none`.
- cfdaf56: Bound parsed TypeScript expansion and support nested object types in JSDoc event tags without oversized output or malformed event names.
