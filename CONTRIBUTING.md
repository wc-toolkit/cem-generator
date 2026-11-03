# Contributing

This repo is a TypeScript monorepo managed with workspace packages under `packages/*`.

## Prerequisites

- Node.js 20+
- `pnpm` (preferred) or `npm`

## Install

Using pnpm:

```sh
pnpm install
```

Using npm:

```sh
npm install
```

## Run locally

Build all packages (TypeScript project references):

```sh
pnpm build
```

Run documentation site (Astro Starlight):

```sh
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

or

```sh
npm run build
```

Run the example pipeline:

```sh
pnpm example
```

or

```sh
npm run example
```

Run package demos independently:

```sh
pnpm demo:core
pnpm demo:core-utils
pnpm demo:lit
```

Or run all package demos:

```sh
pnpm demo:all
```

## Test

Run contract tests:

```sh
pnpm test
```

This runs:

- `pnpm build`
- package-level tests via `pnpm -r --filter './packages/**' --if-present test`

Current package tests:

- `packages/core/tests/pipeline-contracts.test.mjs`
- `packages/core/tests/jsdoc-supported-tags.test.mjs`

Use the example run as an additional smoke check after major changes.

## Workspace tips

- Workspace packages:
  - `@wc-toolkit/cem-generator-utils`
  - `@wc-toolkit/cem-generator`
  - `@wc-toolkit/cem-generator-lit`
- Root `tsconfig.json` uses project references; package `tsconfig.json` files participate in the root build.

## Contribution workflow

1. Create a focused branch.
2. Make small, reviewable commits.
3. Run build and smoke-check example locally.
4. Update docs when behavior or contracts change (root README and package READMEs).
5. Open a PR with:
   - What changed
   - Why it changed
   - How you validated it

## Releases

Add a changeset to a package change:

```sh
pnpm changeset
```

The release workflow creates a release pull request from changesets merged to
`main`. Merging that pull request publishes the public packages to npm.

### Adding a new public package

npm trusted publishing (OIDC) only works for a package that already exists on
npm. The release workflow cannot create a new package, so a new package needs
a one-time manual first publish before it can be bound to GitHub Actions:

1. Build and check the package: run `pnpm build`, then `pnpm pack --dry-run` in the package directory.
   Use `pnpm publish`, not `npm publish`, because only pnpm rewrites `workspace:*` dependencies.
2. From the package directory, publish once with a maintainer account and one-time password:
   `pnpm publish --access public`.
3. Bind the package to the release workflow:
   `npm trust github <package> --file release.yml --repo wc-toolkit/cem-generator -y`.
4. Confirm with `npm trust list <package>`. Later releases publish from the
   workflow with provenance.

## Plugin contribution guidance

- Keep detector `shouldAnalyze()` checks cheap and text-based.
- Keep detector output isolated; avoid cross-plugin coupling.
- Use detector `afterAllFiles` for cross-file detector enrichment.
- Use annotators for additive post-assembly metadata only.
- Reuse shared helpers from `@wc-toolkit/cem-generator-utils` instead of duplicating logic.
