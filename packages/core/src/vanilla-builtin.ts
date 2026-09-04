import ts from "typescript";
import type { DetectorPlugin, FileContext, ManifestFragment, ClassFragment } from "./types.js";
import {
  getJSDocInfo,
  getNodeTypeText,
  getParsedTypeText,
  getParsedTypeTextFromType,
  resolveParsedTypeFromText,
  parseCemClassTags,
  parseCemMemberTags,
} from "@cem-generator/core-utils";

export function vanillaBuiltin(): DetectorPlugin {
  return {
    name: "vanilla",

    claims(sourceText) {
      return sourceText.includes("HTMLElement") || sourceText.includes("customElements.define");
    },

    onFile(context: FileContext): ManifestFragment {
      const fragment: ManifestFragment = {};
      const tagNamesByClass = collectDefineCalls(context.sourceFile);

      ts.forEachChild(context.sourceFile, function visit(node) {
        if (ts.isClassDeclaration(node) && node.name && extendsHTMLElement(node)) {
          const className = node.name.text;
          const jsdoc = getJSDocInfo(node);
          const classDoc = parseCemClassTags(node);

          const classFragment: ClassFragment = {
            name: className,
            exportName: getExportName(node),
            module: context.filePath,
            description: jsdoc.description || undefined,
            summary: classDoc.summary,
            deprecated: classDoc.deprecated,
            tagName: classDoc.tagName ?? tagNamesByClass.get(className),
            superclass: getSuperclassRef(node),
            attributes: mergeByName(
              getObservedAttributes(node).map((name) => ({ name })),
              classDoc.attributes
            ),
            members: getPublicMembers(node, context),
            slots: classDoc.slots,
            cssProperties: classDoc.cssProperties,
            cssParts: classDoc.cssParts,
            cssStates: classDoc.cssStates,
            omitInherited: classDoc.omitInherited,
            events: classDoc.events?.map((event) => ({
              ...event,
              parsedType: resolveParsedTypeFromText(event.type, context.sourceFile, context.checker),
            })),
          };

          for (const attr of classFragment.attributes ?? []) {
            attr.parsedType = resolveParsedTypeFromText(attr.type, context.sourceFile, context.checker);
          }

          applyMemberToAttributeLinks(classFragment, classDoc, context);

          fragment[className] = classFragment;
        }
        ts.forEachChild(node, visit);
      });

      return fragment;
    },
  };
}

function getExportName(node: ts.ClassDeclaration): string | undefined {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return undefined;
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) return "default";
  return node.name?.text;
}

function extendsHTMLElement(node: ts.ClassDeclaration): boolean {
  if (!node.heritageClauses) return false;
  return node.heritageClauses.some((clause) =>
    clause.types.some((t) => t.expression.getText().match(/HTMLElement$/))
  );
}

function getSuperclassRef(node: ts.ClassDeclaration): ClassFragment["superclass"] {
  const clause = node.heritageClauses?.find((c) => c.token === ts.SyntaxKind.ExtendsKeyword);
  const expr = clause?.types[0]?.expression.getText();
  if (!expr || expr === "HTMLElement") return undefined;
  return { name: expr };
}

function getObservedAttributes(node: ts.ClassDeclaration): string[] {
  for (const member of node.members) {
    const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
    const isObservedAttrs =
      (ts.isGetAccessorDeclaration(member) || ts.isPropertyDeclaration(member)) &&
      member.name.getText() === "observedAttributes" &&
      modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);

    if (!isObservedAttrs) continue;

    let arrayLiteral: ts.ArrayLiteralExpression | undefined;
    if (ts.isGetAccessorDeclaration(member) && member.body) {
      const returnStmt = member.body.statements.find(ts.isReturnStatement);
      if (returnStmt?.expression && ts.isArrayLiteralExpression(returnStmt.expression)) {
        arrayLiteral = returnStmt.expression;
      }
    } else if (ts.isPropertyDeclaration(member) && member.initializer) {
      if (ts.isArrayLiteralExpression(member.initializer)) {
        arrayLiteral = member.initializer;
      }
    }

    if (arrayLiteral) {
      return arrayLiteral.elements
        .filter(ts.isStringLiteralLike)
        .map((el) => el.text);
    }
  }
  return [];
}

function getPublicMembers(node: ts.ClassDeclaration, context: FileContext): ClassFragment["members"] {
  const byName = new Map<string, NonNullable<ClassFragment["members"]>[number]>();

  for (const member of node.members) {
    const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
    const privacy = getPrivacy(modifiers);
    const nameText = member.name?.getText();
    if (!nameText || nameText.startsWith("#") || nameText.startsWith("_")) continue;
    if (nameText === "observedAttributes") continue;

    const jsdoc = getJSDocInfo(member);
    const existing = byName.get(nameText);
    const memberDoc = parseCemMemberTags(member);
    if (memberDoc.internal) continue;

    if (
      ts.isPropertyDeclaration(member) ||
      ts.isGetAccessorDeclaration(member) ||
      ts.isSetAccessorDeclaration(member)
    ) {
      const typeText = getNodeTypeText(member, context.checker);
      const parsedTypeText = getParsedTypeText(member, context.checker);
      byName.set(nameText, {
        name: nameText,
        kind: "field",
        description: jsdoc.description || existing?.description || undefined,
        summary: memberDoc.summary,
        deprecated: memberDoc.deprecated,
        privacy,
        static: isStatic(modifiers),
        readonly: isReadonly(member),
        type: typeText,
        parsedType: parsedTypeText && parsedTypeText !== typeText ? parsedTypeText : undefined,
        attribute:
          memberDoc.attribute ?? (memberDoc.attributeFromFieldName ? normalizeAttributeName(nameText) : undefined),
        reflects: memberDoc.reflects,
        internal: memberDoc.internal,
        default: memberDoc.default,
      });
    } else if (ts.isMethodDeclaration(member) && !existing) {
      byName.set(nameText, {
        name: nameText,
        kind: "method",
        description: jsdoc.description || undefined,
        summary: memberDoc.summary,
        deprecated: memberDoc.deprecated,
        privacy,
        static: isStatic(modifiers),
        parameters: getMethodParameters(member, context),
        return: getMethodReturn(member, context),
      });
    }
  }
  return [...byName.values()];
}

function getMethodParameters(
  method: ts.MethodDeclaration,
  context: FileContext
): Array<{ name: string; type?: string; parsedType?: string; optional?: boolean; rest?: boolean; default?: string }> {
  return method.parameters.map((p) => {
    const typeText = getNodeTypeText(p, context.checker);
    const parsedTypeText = getParsedTypeText(p, context.checker);
    return {
      name: p.name.getText(),
      type: typeText,
      parsedType: parsedTypeText && parsedTypeText !== typeText ? parsedTypeText : undefined,
      optional: p.questionToken ? true : undefined,
      rest: p.dotDotDotToken ? true : undefined,
      default: p.initializer ? p.initializer.getText() : undefined,
    };
  });
}

function getMethodReturn(
  method: ts.MethodDeclaration,
  context: FileContext
): { type?: string; parsedType?: string; description?: string } | undefined {
  const type = getNodeTypeText(method, context.checker);
  if (!type) return undefined;
  let parsedType: string | undefined;
  try {
    const signature = context.checker.getSignatureFromDeclaration(method);
    const returnType = signature ? context.checker.getReturnTypeOfSignature(signature) : undefined;
    if (returnType) {
      const expanded = getParsedTypeTextFromType(returnType, context.checker);
      parsedType = expanded !== type ? expanded : undefined;
    }
  } catch {
    parsedType = undefined;
  }
  return { type, parsedType };
}

function isStatic(modifiers: readonly ts.Modifier[] | undefined): boolean | undefined {
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ? true : undefined;
}

function getPrivacy(modifiers: readonly ts.Modifier[] | undefined): "public" | "private" | "protected" | undefined {
  if (!modifiers) return undefined;
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)) return "private";
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)) return "protected";
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.PublicKeyword)) return "public";
  return undefined;
}

function isReadonly(member: ts.ClassElement): boolean | undefined {
  if (!ts.isPropertyDeclaration(member)) return undefined;
  const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) ? true : undefined;
}

function applyMemberToAttributeLinks(
  classFragment: ClassFragment,
  classDoc: { properties?: Array<{ name: string; description?: string; type?: string }> },
  context: FileContext
) {
  if (!classFragment.members?.length) return;

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
    const memberAny = member as Record<string, unknown>;
    const attribute = typeof memberAny.attribute === "string" ? memberAny.attribute : undefined;
    if (!attribute) continue;

    const attrName = attribute === "" ? normalizeAttributeName(member.name) : attribute;
    const attrs = (classFragment.attributes ??= []);
    let attr = attrs.find((a) => a.name === attrName);
    if (!attr) {
      attr = { name: attrName };
      attrs.push(attr);
    }
    attr.type = attr.type ?? (typeof memberAny.type === "string" ? memberAny.type : undefined);
    (attr as Record<string, unknown>).parsedType =
      (attr as Record<string, unknown>).parsedType ??
      (typeof memberAny.parsedType === "string" ? memberAny.parsedType : undefined);
    attr.description = attr.description ?? member.description;
    (attr as Record<string, unknown>).default =
      (attr as Record<string, unknown>).default ??
      (typeof memberAny.default === "string" ? memberAny.default : undefined);
    (attr as Record<string, unknown>).fieldName =
      (attr as Record<string, unknown>).fieldName ?? member.name;
  }

  for (const attr of classFragment.attributes ?? []) {
    const rec = attr as Record<string, unknown>;
    rec.parsedType =
      (typeof rec.parsedType === "string" ? rec.parsedType : undefined) ??
      resolveParsedTypeFromText(typeof rec.type === "string" ? rec.type : undefined, context.sourceFile, context.checker);
  }
}

function normalizeAttributeName(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function mergeByName<T extends { name: string }>(
  first: T[] | undefined,
  second: T[] | undefined
): T[] | undefined {
  const merged = new Map<string, T>();
  for (const item of first ?? []) merged.set(item.name, item);
  for (const item of second ?? []) merged.set(item.name, item);
  return merged.size ? [...merged.values()] : undefined;
}

function collectDefineCalls(sourceFile: ts.SourceFile): Map<string, string> {
  const result = new Map<string, string>();

  ts.forEachChild(sourceFile, function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText() === "customElements" &&
      node.expression.name.text === "define"
    ) {
      const [tagArg, classArg] = node.arguments;
      if (tagArg && ts.isStringLiteralLike(tagArg) && classArg && ts.isIdentifier(classArg)) {
        result.set(classArg.text, tagArg.text);
      }
    }
    ts.forEachChild(node, visit);
  });

  return result;
}
