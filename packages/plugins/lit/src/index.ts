import ts from "typescript";
import type { DetectorPlugin, FileContext, ManifestFragment, ClassFragment } from "@cem-generator/core";
import {
  getJSDocInfo,
  getNodeTypeText,
  getParsedTypeText,
  resolveParsedTypeFromText,
  parseCemClassTags,
  parseCemMemberTags,
} from "@cem-generator/core-utils";

export function litPlugin(): DetectorPlugin {
  return {
    name: "lit",

    claims(sourceText) {
      return /from\s+['"]lit['"]/.test(sourceText) || /extends\s+LitElement/.test(sourceText);
    },

    onFile(context: FileContext): ManifestFragment {
      const fragment: ManifestFragment = {};

      ts.forEachChild(context.sourceFile, function visit(node) {
        if (ts.isClassDeclaration(node) && node.name && extendsLitElement(node)) {
          const className = node.name.text;
          const jsdoc = getJSDocInfo(node);
          const classDoc = parseCemClassTags(node);

          fragment[className] = {
            name: className,
            exportName: getExportName(node),
            module: context.filePath,
            description: jsdoc.description || undefined,
            summary: classDoc.summary,
            deprecated: classDoc.deprecated,
            tagName: classDoc.tagName,
            superclass: { name: "LitElement", module: "lit" },
            members: getDecoratedProperties(node, context),
            slots: classDoc.slots,
            events: classDoc.events?.map((event) => ({
              ...event,
              parsedType: resolveParsedTypeFromText(event.type, context.sourceFile, context.checker),
            })),
            cssParts: mergeCssParts(extractCssParts(node), classDoc.cssParts),
            cssStates: classDoc.cssStates,
            cssProperties: mergeCssProperties(extractCssCustomProps(node), classDoc.cssProperties),
            omitInherited: classDoc.omitInherited,
            attributes: classDoc.attributes,
          };

          for (const attr of fragment[className].attributes ?? []) {
            attr.parsedType = resolveParsedTypeFromText(attr.type, context.sourceFile, context.checker);
          }

          applyMemberToAttributeLinks(fragment[className], classDoc);
        }
        ts.forEachChild(node, visit);
      });

      return fragment;
    },
  };
}

function extractCssParts(node: ts.ClassDeclaration): ClassFragment["cssParts"] {
  const text = node.getText();
  const attrMatches = [...text.matchAll(/\bpart\s*=\s*(["'])([^"']+)\1/g)];
  if (attrMatches.length === 0) return undefined;

  const byName = new Map<string, NonNullable<ClassFragment["cssParts"]>[number]>();
  for (const [, , rawValue] of attrMatches) {
    for (const token of rawValue.split(/\s+/).map((v) => v.trim()).filter(Boolean)) {
      if (!byName.has(token)) byName.set(token, { name: token });
    }
  }

  const commentBeforePartElement = [
    ...text.matchAll(/<!--([\s\S]*?)-->\s*<[^>]*\bpart\s*=\s*(["'])([^"']+)\2[^>]*>/g),
  ];
  for (const [, rawComment, , rawValue] of commentBeforePartElement) {
    const description = parseTemplateComment(rawComment);
    if (!description) continue;
    for (const token of rawValue.split(/\s+/).map((v) => v.trim()).filter(Boolean)) {
      const existing = byName.get(token);
      if (!existing) continue;
      if (!existing.description) existing.description = description;
    }
  }

  return byName.size ? [...byName.values()] : undefined;
}

function parseTemplateComment(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw
    .split("\n")
    .map((line) => line.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function getExportName(node: ts.ClassDeclaration): string | undefined {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return undefined;
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) return "default";
  return node.name?.text;
}

function extendsLitElement(node: ts.ClassDeclaration): boolean {
  return !!node.heritageClauses?.some((clause) =>
    clause.types.some((t) => t.expression.getText() === "LitElement")
  );
}

/** Detects `@property({...}) name: Type;` and `@state() name: Type;` fields. */
function getDecoratedProperties(node: ts.ClassDeclaration, context: FileContext): ClassFragment["members"] {
  const members: NonNullable<ClassFragment["members"]> = [];

  for (const member of node.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    const decorators = ts.getDecorators?.(member) ?? [];

    const propertyDecorator = decorators.find((d) => {
      const expr = ts.isCallExpression(d.expression) ? d.expression.expression : d.expression;
      return expr.getText() === "property" || expr.getText() === "state";
    });
    if (!propertyDecorator) continue;

    const isState = propertyDecorator.expression.getText().startsWith("state");
    const nameText = member.name.getText();
    const jsdoc = getJSDocInfo(member);
    const memberDoc = parseCemMemberTags(member);
    if (memberDoc.internal) continue;
    const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
    const typeText = getNodeTypeText(member, context.checker);
    const parsedTypeText = getParsedTypeText(member, context.checker);

    members.push({
      name: nameText,
      kind: "field",
      type: typeText,
      parsedType: parsedTypeText && parsedTypeText !== typeText ? parsedTypeText : undefined,
      description: jsdoc.description || undefined,
      summary: memberDoc.summary,
      deprecated: memberDoc.deprecated,
      privacy: getPrivacy(modifiers),
      static: modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword) || undefined,
      readonly: modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ReadonlyKeyword) || undefined,
      internal: isState || memberDoc.internal || undefined,
      attribute: memberDoc.attribute,
      reflects: memberDoc.reflects,
      default: memberDoc.default,
    });
  }

  return members;
}

function getPrivacy(modifiers: readonly ts.Modifier[] | undefined): "public" | "private" | "protected" | undefined {
  if (!modifiers) return undefined;
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)) return "private";
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)) return "protected";
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.PublicKeyword)) return "public";
  return undefined;
}

function applyMemberToAttributeLinks(
  classFragment: ManifestFragment[string],
  classDoc: { properties?: Array<{ name: string; description?: string; type?: string }> }
) {
  if (!classFragment.members) return;

  const byName = new Map(classFragment.members.map((m) => [m.name, m]));
  for (const prop of classDoc.properties ?? []) {
    const existing = byName.get(prop.name);
    if (existing) {
      existing.description = existing.description ?? prop.description;
      existing.type = existing.type ?? prop.type;
      continue;
    }
    classFragment.members.push({
      name: prop.name,
      kind: "field",
      description: prop.description,
      type: prop.type,
    });
  }

  for (const member of classFragment.members) {
    const m = member as Record<string, unknown>;
    const attr = typeof m.attribute === "string" ? m.attribute : undefined;
    if (!attr) continue;
    const attrs = (classFragment.attributes ??= []);
    let existingAttr = attrs.find((a) => a.name === attr);
    if (!existingAttr) {
      existingAttr = { name: attr };
      attrs.push(existingAttr);
    }
    existingAttr.type = existingAttr.type ?? (typeof m.type === "string" ? m.type : undefined);
    (existingAttr as Record<string, unknown>).parsedType =
      (existingAttr as Record<string, unknown>).parsedType ??
      (typeof m.parsedType === "string" ? m.parsedType : undefined);
    existingAttr.description = existingAttr.description ?? member.description;
    (existingAttr as Record<string, unknown>).default =
      (existingAttr as Record<string, unknown>).default ??
      (typeof m.default === "string" ? m.default : undefined);
    (existingAttr as Record<string, unknown>).fieldName =
      (existingAttr as Record<string, unknown>).fieldName ?? member.name;
  }
}

function mergeCssProperties(
  a: ClassFragment["cssProperties"],
  b: ClassFragment["cssProperties"]
): ClassFragment["cssProperties"] {
  const merged = new Map<string, NonNullable<ClassFragment["cssProperties"]>[number]>();
  for (const item of a ?? []) merged.set(item.name, item);
  for (const item of b ?? []) merged.set(item.name, { ...merged.get(item.name), ...item });
  return merged.size ? [...merged.values()] : undefined;
}

function mergeCssParts(a: ClassFragment["cssParts"], b: ClassFragment["cssParts"]): ClassFragment["cssParts"] {
  const merged = new Map<string, NonNullable<ClassFragment["cssParts"]>[number]>();
  for (const item of a ?? []) merged.set(item.name, item);
  for (const item of b ?? []) merged.set(item.name, { ...merged.get(item.name), ...item });
  return merged.size ? [...merged.values()] : undefined;
}

/** Naive scan of the class's `static styles` tagged template for custom
 *  property declarations on :host (e.g. `--token: value;`) and CSS
 *  `@property --token { ... }` definitions. Real version would need to
 *  handle imported/shared style modules and full CSS parsing; this is
 *  intentionally the simple case to keep the example focused. */
function extractCssCustomProps(node: ts.ClassDeclaration): ClassFragment["cssProperties"] {
  const stylesMember = node.members.find((m) => {
    if (!ts.isPropertyDeclaration(m) || m.name.getText() !== "styles") return false;
    const modifiers = ts.canHaveModifiers(m) ? ts.getModifiers(m) : undefined;
    return modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword);
  });
  if (!stylesMember) return undefined;

  const text = stylesMember.getText();
  const byName = new Map<string, NonNullable<ClassFragment["cssProperties"]>[number]>();

  const hostBlocks = [...text.matchAll(/:host(?:\([^)]*\))?\s*\{([\s\S]*?)\}/g)];
  const hostDeclarations = hostBlocks.flatMap((block) =>
    [
      ...(block[1] ?? "").matchAll(
        /(?:\/\*\*([\s\S]*?)\*\/\s*)?(--[a-zA-Z0-9-]+)\s*:\s*([^;}{]+)\s*;/g
      ),
    ]
  );
  for (const [, jsdocComment, name, defaultValue] of hostDeclarations) {
    if (byName.has(name)) continue;
    byName.set(name, {
      name,
      default: defaultValue.trim() || undefined,
      description: parseCssJSDocComment(jsdocComment),
    });
  }

  const propertyRules = [
    ...text.matchAll(
      /(?:\/\*\*([\s\S]*?)\*\/\s*)?@property\s+(--[a-zA-Z0-9-]+)\s*\{([\s\S]*?)\}/g
    ),
  ];
  for (const [, jsdocComment, name, body] of propertyRules) {
    const syntax = extractCssDeclarationValue(body, "syntax");
    const initialValue = extractCssDeclarationValue(body, "initial-value");
    const cleanedSyntax = stripCssQuotes(syntax?.trim());
    const entry = byName.get(name) ?? { name };
    byName.set(name, {
      ...entry,
      syntax: cleanedSyntax ?? entry.syntax,
      default: initialValue?.trim() || entry.default,
      description: parseCssJSDocComment(jsdocComment) ?? entry.description,
    });
  }

  return byName.size ? [...byName.values()] : undefined;
}

function extractCssDeclarationValue(block: string, propertyName: string): string | undefined {
  const match = block.match(new RegExp(`${propertyName}\\s*:\\s*([^;]+)\\s*;`));
  return match?.[1];
}

function stripCssQuotes(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseCssJSDocComment(rawComment: string | undefined): string | undefined {
  if (!rawComment) return undefined;
  const text = rawComment
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, ""))
    .join("\n")
    .trim();
  return text || undefined;
}
