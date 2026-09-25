import ts from "@typescript/typescript6";
import type { FileContext, ClassFragment } from "./types.js";
import {
  getJSDocInfo,
  getNodeTypeText,
  getParsedTypeText,
  getParsedTypeTextFromType,
  areTypeTextsEquivalent,
  parseCemMemberTags,
} from "@wc-toolkit/cem-generator-utils";

const memberCache = new WeakMap<
  ts.ClassLikeDeclaration,
  WeakMap<ts.TypeChecker, ClassFragment["members"]>
>();

/** Detects public class fields and methods for framework-specific detectors. */
export function detectClassMembers(
  node: ts.ClassLikeDeclaration,
  context: FileContext,
): ClassFragment["members"] {
  const cachedByChecker = memberCache.get(node);
  if (cachedByChecker?.has(context.checker)) {
    return cloneMembers(cachedByChecker.get(context.checker));
  }

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
      const parsedTypeText = shouldParseMember(privacy, isStatic(modifiers), context.typeParsing)
        ? getParsedTypeText(member, context.checker)
        : undefined;
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
        parsedType:
          parsedTypeText &&
          !areTypeTextsEquivalent(parsedTypeText, typeText, { ignoreUndefined: true })
            ? parsedTypeText
            : undefined,
        attribute:
          memberDoc.attribute ??
          (memberDoc.attributeFromFieldName ? normalizeAttributeName(nameText) : undefined),
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
        parameters: getMethodParameters(
          member,
          context,
          shouldParseMember(privacy, isStatic(modifiers), context.typeParsing),
        ),
        return: getMethodReturn(
          member,
          context,
          shouldParseMember(privacy, isStatic(modifiers), context.typeParsing),
        ),
        customJsDocTags: memberDoc.customJsDocTags,
      });
    }
  }

  const members = [...byName.values()];
  const checkerCache = cachedByChecker ?? new WeakMap<ts.TypeChecker, ClassFragment["members"]>();
  checkerCache.set(context.checker, members);
  memberCache.set(node, checkerCache);
  return cloneMembers(members);
}

function cloneMembers(members: ClassFragment["members"]): ClassFragment["members"] {
  return members?.map((member) => {
    const customJsDocTags = (member as Record<string, unknown>).customJsDocTags as
      | Array<{ name: string; text: string }>
      | undefined;
    return {
      ...member,
      parameters: member.parameters?.map((parameter) => ({ ...parameter })),
      return: member.return ? { ...member.return } : undefined,
      customJsDocTags: customJsDocTags?.map((tag) => ({ ...tag })),
    };
  });
}

function shouldParseMember(
  privacy: "public" | "private" | "protected" | undefined,
  staticMember: boolean | undefined,
  mode: FileContext["typeParsing"],
): boolean {
  if (mode === "none") return false;
  if (mode === "all") return true;
  return privacy !== "private" && privacy !== "protected" && !staticMember;
}

function getMethodParameters(
  method: ts.MethodDeclaration,
  context: FileContext,
  parseTypes: boolean,
): Array<{
  name: string;
  type?: string;
  parsedType?: string;
  optional?: boolean;
  rest?: boolean;
  default?: string;
}> {
  return method.parameters.map((p) => {
    const typeText = getNodeTypeText(p, context.checker);
    const parsedTypeText = parseTypes ? getParsedTypeText(p, context.checker) : undefined;
    return {
      name: p.name.getText(),
      type: typeText,
      parsedType:
        parsedTypeText &&
        !areTypeTextsEquivalent(parsedTypeText, typeText, { ignoreUndefined: true })
          ? parsedTypeText
          : undefined,
      optional: p.questionToken ? true : undefined,
      rest: p.dotDotDotToken ? true : undefined,
      default: p.initializer ? p.initializer.getText() : undefined,
    };
  });
}

function getMethodReturn(
  method: ts.MethodDeclaration,
  context: FileContext,
  parseTypes: boolean,
): { type?: string; parsedType?: string; description?: string } | undefined {
  const type = getNodeTypeText(method, context.checker);
  if (!type) return undefined;
  let parsedType: string | undefined;
  try {
    const signature = context.checker.getSignatureFromDeclaration(method);
    const returnType = signature ? context.checker.getReturnTypeOfSignature(signature) : undefined;
    if (returnType) {
      const expanded = parseTypes
        ? getParsedTypeTextFromType(returnType, context.checker)
        : undefined;
      const returnTypeText = context.checker.typeToString(returnType).trim();
      parsedType =
        expanded && !areTypeTextsEquivalent(expanded, returnTypeText, { ignoreUndefined: true })
          ? expanded
          : undefined;
    }
  } catch {
    parsedType = undefined;
  }
  return { type, parsedType };
}

function isStatic(modifiers: readonly ts.Modifier[] | undefined): boolean | undefined {
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ? true : undefined;
}

function getPrivacy(
  modifiers: readonly ts.Modifier[] | undefined,
): "public" | "private" | "protected" | undefined {
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
