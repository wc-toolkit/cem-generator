---
"@wc-toolkit/cem-generator-utils": patch
"@wc-toolkit/cem-generator": patch
"@wc-toolkit/cem-generator-fast": patch
"@wc-toolkit/cem-generator-lwc": patch
---

Add a shared `inheritsFrom()` heritage walker and reuse it in the core vanilla
detector and the Lit, FAST, and LWC plugins. Custom base classes are now
resolved the same way everywhere, including bases declared in other modules and
mixin arguments.
