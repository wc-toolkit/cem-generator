---
title: Type Parsing
description: Expand TypeScript and JSDoc types into structured parsedType metadata.
---

The generator emits the type written in the source as `type.text`. When TypeScript can resolve and expand that type, it also emits a generator-specific `parsedType.text` value.

`parsedType` is an extension field. It is not part of the standard Custom Elements Manifest schema, so consumers should continue to use `type.text` when they only support standard CEM fields.

## Alias Expansion

Named aliases are expanded into their underlying types:

```ts
type Mode = "primary" | "secondary";

class MyElement extends HTMLElement {
  mode: Mode | undefined;
}
```

```json
{
  "name": "mode",
  "type": { "text": "Mode | undefined" },
  "parsedType": { "text": "'primary' | 'secondary' | undefined" }
}
```

The original spelling is preserved in `type.text`; `parsedType.text` is intended for tooling that needs the resolved values.

## Supported Types

The parser expands:

- Type aliases, interfaces, enums, classes, and imported type declarations
- Union and intersection types
- String, number, and boolean literal types
- Arrays and tuples
- Object types, including optional properties
- `undefined` unions, which are normalized to the end of the union

For example:

```ts
interface Payload {
  id: string;
  count?: number;
}

type Values = Payload[] | ["start", "end"];
```

Produces a parsed representation similar to:

```json
{
  "text": "{ id: string; count?: number }[] | ['start', 'end']"
}
```

Formatting follows TypeScript's type model and may vary slightly with compiler version or declaration shape.

## Supported Contexts

Parsed types can appear in all of these manifest locations:

```text
declarations[].members[].parsedType
declarations[].attributes[].parsedType
declarations[].events[].parsedType
declarations[].members[].parameters[].parsedType
declarations[].members[].return.parsedType
```

This includes types discovered by the built-in vanilla detector and the Lit plugin.

## Inference And JSDoc

For TypeScript members, explicit annotations take priority. If no annotation exists, the TypeChecker's inferred type is used when it is specific enough:

```ts
class MyElement extends HTMLElement {
  count = 0;
}
```

For JavaScript files, enable `allowJs` in the TypeScript configuration. A JSDoc `@type` annotation can provide the source type:

```js
class MyElement extends HTMLElement {
  /** @type {"small" | "large"} */
  size = "small";
}
```

The source type remains available as `type.text`, while a resolved or expanded value is emitted as `parsedType.text` when it differs.

## Fallbacks And Limits

- `any` and `unknown` inference is omitted when no more useful type is available.
- Unresolved names are preserved rather than causing generation to fail.
- Recursive or deeply nested types are bounded to avoid runaway expansion.
- If expansion produces the same text as the original type, `parsedType` is usually omitted.
- TypeScript compiler diagnostics do not prevent best-effort type extraction.
