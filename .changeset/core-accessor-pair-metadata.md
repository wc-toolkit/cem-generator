---
"@wc-toolkit/cem-generator": patch
---

Merge member metadata declared on either half of a getter/setter pair instead of
letting the second declaration discard JSDoc summaries, attributes, defaults,
and reflection flags.
