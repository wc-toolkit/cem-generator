---
"@wc-toolkit/cem-generator-utils": patch
"@wc-toolkit/cem-generator": patch
---

Fix inheritance resolution to key declaration identity by `module#name` instead
of class name alone. This prevents false circular-superclass errors when a
subclass shares the same class name as an imported/aliased superclass from a
different module.

Also adds regression coverage for both the same-name cross-module inheritance
case and true circular superclass chains.
