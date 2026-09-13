# Bundler Plugin Guide

`packages/bundler-plugin` adapts generation to Vite/Rollup/Rolldown and Webpack
build lifecycles. Shared behavior belongs in `src/shared.ts`; bundler-specific
registration belongs in `src/vite.ts` or `src/webpack.ts`.

Read `src/index.ts` first to understand the public exports. Keep file watching,
build hooks, and error propagation consistent across adapters. Validate with
`pnpm test:bundler`, then `pnpm build` for type or adapter changes.
