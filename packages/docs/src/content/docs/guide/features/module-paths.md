---
title: Module Paths
description: Preserve source module paths while resolving CEM modules to published JavaScript files.
---

The generator keeps the analyzed file in the module's `source` property and uses the module's `path` property for the importable runtime JavaScript file.

Path handling can be configured through `modulePathResolver`:

```ts
const manifest = generateCem({
  modulePathResolver: {
    /** Convert the analyzed source file into its published JavaScript module. */
    modulePathTemplate: (modulePath, name, tagName) =>
      `dist/components/${tagName}/${name}.js`,
    /** Do not use an excluded declaration to provide component metadata. */
    exclude: ["InternalElement"],
    /** Set to true to leave module paths unchanged. */
    skip: false,
  },
});
```

`modulePathTemplate` receives the original source path, declaration name, and custom-element tag name. `skip` disables path transformations. `exclude` excludes named declarations from the resolver's component metadata selection.

```jsonc
{
  "kind": "javascript-module",
  // The file analyzed by TypeScript.
  "source": "src/components/button.ts",
  // The JavaScript file consumers import at runtime.
  "path": "dist/components/button.js",
  // API declarations discovered in the source file.
  "declarations": [...],
  // JavaScript and custom-element exports from this module.
  "exports": [...]
}
```

`source` preserves the original path reported by TypeScript. `path` is resolved from the project's build configuration and `package.json` exports map when available.

## Package exports

The resolver selects the `import` target from `exports`. The `types` target is used to correlate a TypeScript source file with its generated module.

```jsonc
{
  "exports": {
    // The package root entry point.
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    // The wildcard captures "button" for a components/button import.
    "./components/*": {
      "types": "./dist/components/*",
      "import": "./dist/components/*"
    }
  }
}
```

With `rootDir: "src"` and `outDir: "dist"`, `src/components/button.ts` resolves to `dist/components/button.js`.

Exact export entries and wildcard entries are supported. The generated `path` is package-relative and is also used by declaration export references.

## Reference updates

When a module path is resolved, known nested module references are updated too. This includes declaration references such as `superclass.module` and export declaration references. References to external packages and unknown modules are left unchanged.

Template results are normalized by collapsing duplicate slashes while preserving relative prefixes such as `./` and URL protocols such as `https://`.

Conditional exports are supported for `types`, `import`, `default`, `node`, and `browser` targets. Array fallbacks are tried in order, and exact export keys take precedence over wildcard keys.

For modules with multiple custom-element declarations, callbacks use the first non-excluded custom element consistently. Definition modules are generated for every non-excluded custom element.

## Fallback

If the project has no usable `package.json` exports map, the original source path remains the module `path`. This preserves behavior for projects that do not publish separate runtime output.
