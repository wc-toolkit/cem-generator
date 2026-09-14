---
"@wc-toolkit/cem-generator-cli": patch
"@wc-toolkit/cem-generator": patch
"@wc-toolkit/cem-generator-lit": patch
---

Allow the CLI to use a manifest path from generator configuration, optionally
add the generated manifest to `package.json` during initialization, and resolve
runtime module paths correctly for packages nested in workspaces.
