---
"@wc-toolkit/cem-generator": minor
"@wc-toolkit/cem-generator-cli": minor
"@wc-toolkit/cem-generator-bundler": minor
---

Add reusable TypeScript programs for watch-mode generation and CLI `--watch` support.

The programmatic `createGeneratorSession()` API, Vite, Rollup, Rolldown, and Webpack watch reruns now reuse the previous TypeScript program instead of rebuilding the project from scratch. Initial builds are unchanged, while subsequent reruns avoid most TypeScript program and type-checker setup time.
