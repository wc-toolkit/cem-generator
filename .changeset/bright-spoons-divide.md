---
"@wc-toolkit/cem-generator": patch
---

Skip `declare`-only class property declarations when generating class members.

This prevents TypeScript declaration-only API narrowing (for example typed
`addEventListener` fields) from being emitted as runtime-settable members in
the generated Custom Elements Manifest.
