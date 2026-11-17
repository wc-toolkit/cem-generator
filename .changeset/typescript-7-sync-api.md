---
"@wc-toolkit/cem-generator": major
"@wc-toolkit/cem-generator-utils": major
"@wc-toolkit/cem-generator-bundler": minor
"@wc-toolkit/cem-generator-cli": minor
"@wc-toolkit/cem-generator-fast": major
"@wc-toolkit/cem-generator-lit": major
"@wc-toolkit/cem-generator-lwc": major
"@wc-toolkit/cem-generator-preact": major
"@wc-toolkit/cem-generator-solid": major
"@wc-toolkit/cem-generator-stencil": major
"@wc-toolkit/cem-generator-svelte": major
"@wc-toolkit/cem-generator-vue": major
---

Move the generator to the TypeScript 7.1 compiler client API (`typescript/sync`, `typescript/ast`, `typescript/ast/is`).

Breaking changes:

- `FileContext.checker` is a `Checker` from `typescript/sync`, and `sourceFile` nodes are TypeScript 7.1 AST nodes from `typescript/ast`. Plugins that used classic `ts.*` APIs must switch to the new entry points.
- `Symbol.declarations` and `valueDeclaration` are handles; resolve them with `.resolve()` or the new `symbolDeclarations()` / `primaryDeclaration()` helpers exported from `@wc-toolkit/cem-generator-utils`.
- `generateCemWithProgram()` and the `programResult` field are removed. Each run creates and disposes its own compiler program; generation in watch mode no longer reuses the previous program.
- `createProgramFromTsConfig()` returns a result that must be disposed with `dispose()`.
- `parseCssMetadata()` and framework detectors are unchanged in shape, but union members in parsed types are ordered by the TypeScript 7.1 checker.

Performance:

- Checker queries are cached and batched, and declaration files are no longer transferred into JavaScript. Compared with the TypeScript 6 build, generation is 14–53% faster across the benchmark fixtures; a project with many non-component classes benefits most from candidate-aware prefetching. Run `pnpm bench:compare` to reproduce the comparison.

