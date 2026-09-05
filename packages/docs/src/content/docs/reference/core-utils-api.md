---
title: Core Utils API
description: Shared helpers in `@cem-generator/core-utils`.
---

## JSDoc helpers

- `getJSDocInfo(node)`
- `getJSDocTagsNamed(node, tagName)`
- `parseCemClassTags(node)`
- `parseCemMemberTags(node)`

## Type helpers

- `getNodeTypeText(node, checker)`
- `getParsedTypeText(node, checker)`
- `getParsedTypeTextFromType(type, checker)`
- `resolveParsedTypeFromText(typeText, sourceFile, checker)`

## Inheritance helper

- `resolveInheritedCollection(findByRef, decl, key, resolved?, inProgress?, options?)`

The resolver supports omit config by kind, class name, and metadata field.
