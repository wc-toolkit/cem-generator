---
"@wc-toolkit/cem-generator": minor
"@wc-toolkit/cem-generator-utils": minor
"@wc-toolkit/cem-generator-cli": minor
"@wc-toolkit/cem-generator-bundler": minor
---

Switch the default compiler server to `tsrs` for all TypeScript 7.1 API clients.

The generator now uses the `tsrs` Rust compiler by default. The `compilerPath`
option (`--compiler` in the CLI, `CEM_GENERATOR_COMPILER` in the environment)
remains available as an override and now falls back to the server bundled with
`typescript` when `tsrs` is not installed or unsupported on the current platform.

Exported-type validation continues to ask the program which files are default
library files, so standard library types are recognised regardless of which
compiler is used. `validateGeneratedManifest()` accepts an optional trailing
`program` argument for this; without it the previous path check applies.
