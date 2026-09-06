---
title: Inheritance
description: Automatic inheritance materialization with JSDoc-based omission controls.
---

Inherited members, attributes, events, slots, and CSS tokens from superclasses are automatically materialized into each subclass declaration.

## Basic usage

```ts
const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  inheritance: {} // enabled by default
});
```

## Disable

```ts
const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  inheritance: false
});
```

## Omitting inherited APIs

Use the `@omit` family of JSDoc tags on a subclass to exclude specific inherited APIs:

```ts
/**
 * @omit-method someInheritedMethod
 * @omit-attribute someAttr anotherAttr
 * @omit-cssprop --some-token
 * @omit-event someEvent
 */
class Child extends Parent {}
```

| Tag | Omits |
|-----|-------|
| `@omit` | Inherited members and attributes |
| `@omit-method` | Inherited members |
| `@omit-attribute` / `@omit-attr` | Inherited attributes |
| `@omit-cssprop` / `@omit-cssproperty` | Inherited CSS custom properties |
| `@omit-part` / `@omit-csspart` | Inherited CSS shadow parts |
| `@omit-cssState` / `@omit-cssstate` | Inherited CSS custom states |
| `@omit-event` | Inherited events |
| `@omit-slot` | Inherited slots |

Or configure globally:

```ts
const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  inheritance: {
    omitByKind: {
      members: ["internalMethod"],
      attributes: ["deprecated-attr"],
      cssProperties: ["--internal-token"],
      cssParts: [],
      cssStates: [],
      slots: [],
      events: []
    }
  }
});
```

See [Inheritance](/guide/inheritance/) for the full inherit/omit option surface.

## External manifests

Inherit from published component libraries by providing their manifests:

```ts
const manifest = generateCem({
  tsConfigPath: "./tsconfig.json",
  inheritance: {
    externalManifests: [
      "./node_modules/some-lib/custom-elements.json",
      "https://cdn.example.com/other-lib/custom-elements.json"
    ],
    includeExternalManifests: true
  }
});
```