---
title: Custom JSDoc Tags
description: Preserve custom JSDoc tags in the manifest without writing a plugin.
---

Custom JSDoc tags are disabled by default. Set `customJsDocTags: true` to preserve every unknown tag, or pass a tag map to configure selected tags. A config object still preserves all unknown tags; it only changes the output name or array behavior for configured tags.

## How it works

When enabled, unknown tags become properties on the class declaration or member where they are documented. They are never promoted to the manifest root. Values use CEM-style metadata such as `{ name, description, type, default }`. Tags the generator already understands — `@summary`, `@attr`, `@slot`, `@default`, `@internal`, `@cssState`, etc. — are excluded so nothing duplicates.

Repeated tags with the same name are collected into an array. A single tag remains a single metadata object unless `isArray: true` is configured.

```ts
/**
 * A friendly progress indicator.
 * @since 2.0.0
 * @license MIT
 * @status beta - Experimental component
 * @a11y https://www.w3.org/WAI/ARIA/apg/patterns/progressbar/
 */
export class MyProgress extends HTMLElement {
  /**
   * @deprecated Use `value` instead.
   * @group visuals
   */
  percent = 0;
}
```

Produces:

```json
{
  "name": "MyProgress",
  "since": { "name": "2.0.0" },
  "license": { "name": "MIT" },
  "status": {
    "name": "beta",
    "description": "Experimental component"
  },
  "a11y": { "name": "https://www.w3.org/WAI/ARIA/apg/patterns/progressbar/" },
  "members": [
    {
      "name": "percent",
      "deprecated": "Use `value` instead.",
      "group": { "name": "visuals" }
    }
  ]
}
```

## What's excluded from `customJsDocTags`

These tags already map to dedicated manifest fields and are not emitted as custom metadata:

`@description`, `@summary`, `@deprecated`, `@default`, `@internal`, `@ignore`, `@reflect`, `@attr`, `@attribute`, `@prop`, `@property`, `@slot`, `@cssprop`, `@cssproperty`, `@part`, `@csspart`, `@cssState`, `@fires`, `@event`, `@tag`, `@tagname`, and all `@omit` variants.

## Mapping And Arrays

```ts
generateCem({
  customJsDocTags: {
    dependency: { mappedName: "dependencies", isArray: true },
  },
});
```

- `mappedName` changes the emitted property name. 
- `isArray` emits a one-item array even when the tag occurs only once; repeated tags are always collected into an array.
