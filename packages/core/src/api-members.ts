import ts from "typescript";
import type { FileContext, ClassFragment } from "./types.js";
import {
  getJSDocInfo,
  getNodeTypeText,
  getParsedTypeText,
  getParsedTypeTextFromType,
  parseCemMemberTags,
} from "@wc-toolkit/cem-generator-utils";

/** Detects public class fields and methods for framework-specific detectors. */
export function detectClassMembers(
  node: ts.ClassDeclaration,
  context: FileContext
): ClassFragment["members"] {
  const byName = new Map<string, NonNullable<ClassFragment["members"]>[number]>();

  for (const member of node.members) {
    const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
    const nameText = member.name?.getText();
    if (!nameText || nameText === "observedAttributes") continue;
    const privacy = nameText.startsWith("#") ? "private" : getPrivacy(modifiers);

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
        default:
          memberDoc.default ??
          (ts.isPropertyDeclaration(member) ? member.initializer?.getText() : undefined),
        customJsDocTags: memberDoc.customJsDocTags,
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
        customJsDocTags: memberDoc.customJsDocTags,
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

function normalizeAttributeName(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
