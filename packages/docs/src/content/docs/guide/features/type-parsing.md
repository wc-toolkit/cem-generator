---
title: Type Parsing
description: TypeScript and JSDoc types are parsed into structured parsedType fields.
---

TypeScript types are parsed and included in the manifest as `parsedType` fields alongside the stringified `type.text`. This enables richer tooling.

```ts
/** @type {number | string} */
myProperty = 42;
```

Output:
```json
{
  "name": "myProperty",
  "type": { "text": "number | string" },
  "parsedType": { "text": "string | number" }
}
```

## Supported contexts

- Class fields (`members[].type`)
- Attributes (`attributes[].type`)
- Events (`events[].type`)
- Method parameters (`members[].parameters[].type`)
- Method returns (`members[].return.type`)

## JSDoc type annotations

For untyped members in JavaScript files (`checkJs`/`allowJs`), a `@type` JSDoc tag is honored and flows into the emitter:

```ts
/**
 * @type {number | string}
 */
myProperty = 42;
```

In TypeScript files, the explicit type annotation (or TypeChecker inference) is used instead — see [Documenting Components](/guide/documenting/) for how member types resolve.