import * as ts from "typescript/ast";
import {
  getModifiers,
  getJSDocInfo,
  getNodeTypeText,
  getParsedTypeText,
  getParsedTypeTextFromType,
  areTypeTextsEquivalent,
  parseCemMemberTags,
  getLiteralDefaultText,
  typeToText,
} from "@wc-toolkit/cem-generator-utils";
import * as is from "typescript/ast/is";
import type { Checker, Type as TsType } from "typescript/sync";
import type { FileContext, ClassFragment } from "./types.js";

const memberCache = new WeakMap<
  ts.ClassLikeDeclaration,
  WeakMap<Checker, ClassFragment["members"]>
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
    const modifiers = getModifiers(member);
    if (is.isPropertyDeclaration(member) && isDeclare(modifiers)) continue;
    const nameText = (member as { name?: ts.Node }).name?.getText();
    if (!nameText || nameText === "observedAttributes") continue;
    const privacy = nameText.startsWith("#") ? "private" : getPrivacy(modifiers);

    const jsdoc = getJSDocInfo(member);
    const existing = byName.get(nameText);
    const memberDoc = parseCemMemberTags(member);
    if (memberDoc.internal) continue;

    if (
      is.isPropertyDeclaration(member) ||
      is.isGetAccessorDeclaration(member) ||
      is.isSetAccessorDeclaration(member)
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
        readonly: isReadonly(member, node),
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
          (is.isPropertyDeclaration(member)
            ? getLiteralDefaultText(member.initializer, context.checker)
            : undefined),
        customJsDocTags: memberDoc.customJsDocTags,
      });
    } else if (is.isMethodDeclaration(member) && !existing) {
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
  const checkerCache = cachedByChecker ?? new WeakMap<Checker, ClassFragment["members"]>();
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
  const returnType = getSignatureReturnType(method, context.checker);
  const type = method.type
    ? getNodeTypeText(method, context.checker)
    : getReturnTypeText(returnType, context.checker);
  if (!type) return undefined;
  let parsedType: string | undefined;
  try {
    if (returnType) {
      const expanded = parseTypes
        ? getParsedTypeTextFromType(returnType, context.checker)
        : undefined;
      const returnTypeText = typeToText(returnType, context.checker).trim();
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

const methodReturnTypeCache = new WeakMap<
  ts.MethodDeclaration,
  WeakMap<Checker, TsType | undefined>
>();

/** Stores a method return type that was already fetched elsewhere (for example in a batch). */
export function primeMethodReturnType(
  method: ts.MethodDeclaration,
  checker: Checker,
  type: TsType | undefined,
): void {
  const byChecker = methodReturnTypeCache.get(method) ?? new WeakMap<Checker, TsType | undefined>();
  byChecker.set(checker, type);
  methodReturnTypeCache.set(method, byChecker);
}

function getSignatureReturnType(
  method: ts.MethodDeclaration,
  checker: Checker,
): TsType | undefined {
  const cached = methodReturnTypeCache.get(method);
  if (cached?.has(checker)) return cached.get(checker);
  try {
    const signature = checker.getSignatureFromDeclaration(method);
    const type = signature ? checker.getReturnTypeOfSignature(signature) : undefined;
    primeMethodReturnType(method, checker, type);
    return type;
  } catch {
    return undefined;
  }
}

function getReturnTypeText(type: TsType | undefined, checker: Checker): string | undefined {
  if (!type) return undefined;
  const text = typeToText(type, checker).trim();
  return !text || text === "any" || text === "unknown" ? undefined : text;
}

function isStatic(modifiers: readonly ts.Modifier[] | undefined): boolean | undefined {
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ? true : undefined;
}

function isDeclare(modifiers: readonly ts.Modifier[] | undefined): boolean {
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword) ?? false;
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

function isReadonly(member: ts.ClassElement, owner: ts.ClassLikeDeclaration): boolean | undefined {
  if (is.isGetAccessorDeclaration(member)) {
    return hasMatchingSetter(member, owner) ? undefined : true;
  }
  if (!is.isPropertyDeclaration(member)) return undefined;
  const modifiers = getModifiers(member);
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) ? true : undefined;
}

function hasMatchingSetter(
  getter: ts.GetAccessorDeclaration,
  owner: ts.ClassLikeDeclaration,
): boolean {
  const getterName = getter.name.getText();
  const getterStatic = isStatic(getModifiers(getter));
  return owner.members.some((member) => {
    if (!is.isSetAccessorDeclaration(member)) return false;
    const modifiers = getModifiers(member);
    return member.name.getText() === getterName && isStatic(modifiers) === getterStatic;
  });
}

function normalizeAttributeName(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
