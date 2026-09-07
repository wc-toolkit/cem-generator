---
title: Creating Plugins
description: Guide to authoring custom detector and annotator plugins for cem-generator.
---

# Creating Custom Plugins

This guide walks through building a detector plugin from scratch. The same principles apply to annotator plugins.

## Pipeline lifecycle

`generateCem()` processes a project in this order:

1. Build a shared TypeScript program from `tsconfig.json`.
2. Run the built-in vanilla detector and user-supplied detectors per file.
3. Merge detector fragments using `conflictPolicy` (`last-wins` by default, or
   `throw`).
4. Run detector `afterAllFiles` hooks for cross-file detector work.
5. Materialize built-in inheritance.
6. Run annotators with the complete manifest.
7. Convert the internal manifest to CEM 2.1.0 output.

Detector plugins should stay isolated and return fragments for the classes they
detect. Use `afterAllFiles` for cross-file detection that still belongs to the
detector. Use an annotator for independent enrichment after all detectors have
finished.

Detector patches can add fields with `byDeclaration` or `byClassName`. The
`replaceByDeclaration` and `replaceByClassName` forms are reserved for replacing
inheritable collections. Annotator patches are additive-only and cannot
overwrite fields already produced by a detector.

## Plugin Types

### DetectorPlugin

Runs per source file. Extracts class fragments (properties, methods, attributes, events, etc.) and merges them into the manifest.

```ts
interface DetectorPlugin {
  name: string;
  claims(sourceText: string, filePath: string): boolean;
  onFile(context: FileContext): ManifestFragment;
  afterFile?(context: FileContext, ownFragment: ClassFragment | undefined): ClassFragment | undefined;
  afterAllFiles?(manifest: Readonly<InternalManifest>): ManifestPatch;
}
```

### AnnotatorPlugin

Runs once after all detection and inheritance. Enriches the manifest with cross-cutting data.

```ts
interface AnnotatorPlugin {
  name: string;
  afterManifest(manifest: Readonly<InternalManifest>): ManifestPatch;
}
```

## Minimal Detector Plugin

```ts
import type { DetectorPlugin, FileContext, ClassFragment, ManifestFragment } from "@wc-toolkit/cem-generator";

export const myFrameworkPlugin = (): DetectorPlugin => ({
  name: "my-framework",
  
  // Fast opt-in: check if file might contain your framework's components
  claims(sourceText: string, filePath: string): boolean {
    return sourceText.includes("@MyDecorator") || sourceText.includes("MyBaseClass");
  },

  // Core analysis: extract fragments from a claimed file
  onFile(context: FileContext): ManifestFragment {
    const { sourceFile, checker, sourceText, filePath } = context;
    const fragments: ManifestFragment = {};

    // Visit all class declarations in the file
    ts.forEachChild(sourceFile, (node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;

      // Check if class matches your framework (extends base, has decorator, etc.)
      if (!isMyFrameworkComponent(node, checker)) return;

      const className = node.name.text;
      fragments[className] = extractClassFragment(node, checker, sourceFile, filePath);
    });

    return fragments;
  },
});
```

## TypeScript AST Analysis

Use TypeScript's compiler API to analyze classes:

```ts
import ts from "typescript";

function isMyFrameworkComponent(node: ts.ClassDeclaration, checker: ts.TypeChecker): boolean {
  // Check for base class
  const heritage = node.heritageClauses?.[0]?.types;
  if (heritage) {
    for (const h of heritage) {
      const type = checker.getTypeAtLocation(h);
      const symbol = type.getSymbol();
      if (symbol?.name === "MyBaseClass") return true;
    }
  }

  // Check for decorator
  const decorators = ts.getDecorators?.(node);
  if (decorators?.some(d => d.expression.getText().includes("MyDecorator"))) return true;

  return false;
}

function extractClassFragment(
  node: ts.ClassDeclaration,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  filePath: string
): ClassFragment {
  const fragment: ClassFragment = { name: node.name!.text };

  // Tag name from JSDoc or decorator
  fragment.tagName = getTagName(node);

  // Description from JSDoc
  fragment.description = getJSDocDescription(node);

  // Extract members (fields, methods)
  fragment.members = extractMembers(node, checker);

  // Extract attributes, events, slots, CSS props from JSDoc
  fragment.attributes = extractAttributes(node);
  fragment.events = extractEvents(node);
  fragment.slots = extractSlots(node);
  fragment.cssProperties = extractCssProperties(node);

  return fragment;
}
```

## Using JSDoc Tags

Reuse core utilities for standard JSDoc parsing:

```ts
import { getJSDocTagsNamed, getJSDocInfo } from "@wc-toolkit/cem-generator-utils";

function extractAttributes(node: ts.ClassDeclaration): ClassFragment["attributes"] {
  const tags = getJSDocTagsNamed(node, "attribute");
  return tags.map(tag => ({
    name: tag.name,
    type: tag.type,
    description: tag.description,
    default: tag.default,
  }));
}
```

## Complete Example: Simple Detector

```ts
// my-plugin.ts
import ts from "typescript";
import type { DetectorPlugin, FileContext, ClassFragment, ManifestFragment } from "@wc-toolkit/cem-generator";

export const mySimplePlugin = (): DetectorPlugin => ({
  name: "my-simple-plugin",

  claims(sourceText) {
    return sourceText.includes("SimpleComponent");
  },

  onFile(context) {
    const { sourceFile, checker, filePath } = context;
    const fragments: ManifestFragment = {};

    ts.forEachChild(sourceFile, (node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;
      if (!ts.getDecorators?.(node)?.some(d => d.expression.getText().includes("SimpleComponent"))) return;

      const className = node.name.text;
      fragments[className] = {
        name: className,
        tagName: className.toLowerCase().replace(/component$/, ""),
        description: "A simple component",
        members: extractMembers(node, checker),
      };
    });

    return fragments;
  },
});

function extractMembers(node: ts.ClassDeclaration, checker: ts.TypeChecker): ClassFragment["members"] {
  const members: ClassFragment["members"] = [];

  for (const member of node.members) {
    if (!ts.isPropertyDeclaration(member) || !member.name) continue;
    if (!ts.isIdentifier(member.name)) continue;

    const propName = member.name.text;
    const type = member.type ? checker.typeToString(checker.getTypeAtLocation(member.type)) : undefined;

    members.push({
      name: propName,
      kind: "field",
      type,
      privacy: member.modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword) ? "private" : "public",
      static: member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) ?? false,
    });
  }

  return members.length ? members : undefined;
}
```

## Using the Plugin

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { mySimplePlugin } from "./my-plugin.js";

const manifest = generateCem({
  plugins: [mySimplePlugin()],
});
```

## Annotator Plugin Example

```ts
import type { AnnotatorPlugin, InternalManifest, ManifestPatch } from "@wc-toolkit/cem-generator";

export const myAnnotatorPlugin = (): AnnotatorPlugin => ({
  name: "my-annotator",

  afterManifest(manifest): ManifestPatch {
    const patches: ManifestPatch = { byDeclaration: {} };

    for (const mod of manifest.modules) {
      for (const decl of mod.declarations) {
        // Add custom metadata to every component
        patches.byDeclaration[`${mod.path}#${decl.name}`] = {
          myCustomMetadata: {
            generatedAt: new Date().toISOString(),
            customField: "custom-value",
          },
        };
      }
    }

    return patches;
  },
});
```

## Tips

1. **Keep `claims` fast** — only text search, no AST parsing
2. **Use core utilities** — `getJSDocInfo`, `getJSDocTagsNamed`, `getJSDocDescription` for standard JSDoc
3. **Return partial fragments** — core merges fragments from multiple detectors
4. **Use `byDeclaration` patches** — unambiguous targeting via `modulePath#className`
5. **Additive only** — annotator patches must not overwrite existing fields
