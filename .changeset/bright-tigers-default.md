---
"@wc-toolkit/cem-generator-lit": patch
---

Use the shared exact-literal default extractor for decorated Lit fields. Const string and number literals resolve to their values, explicit `@default` tags remain authoritative, and computed initializers are omitted.
