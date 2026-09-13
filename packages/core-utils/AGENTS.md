# Core Utilities Guide

`packages/core-utils` contains reusable implementation shared by core and
framework plugins: JSDoc extraction, type parsing, and inheritance resolution.

## Start here

- `src/jsdoc.ts`: supported tags and comment extraction
- `src/type-parser.ts`: TypeScript type expansion and serialization
- `src/inheritance.ts`: memoized inheritance resolution and cycle handling
- `src/index.ts`: package exports

Keep utilities framework-neutral. Changes here can affect every detector, so
validate with `pnpm test:core` and `pnpm build`, even when the edit is local.
Prefer extending existing helpers over duplicating parsing logic in a plugin.
