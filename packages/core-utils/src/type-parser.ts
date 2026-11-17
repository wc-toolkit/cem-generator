import * as ts from "typescript/ast";
import {
  hasDeclarationOfKind,
  hasLibraryDeclaration,
  primaryDeclaration,
  symbolDeclarations,
} from "./node-utils.js";
import {
  isIntersectionType,
  isUnionType,
  LiteralType,
  ObjectFlags,
  type ObjectType,
  SymbolFlags,
  TypeFlags,
  TypeFormatFlags,
  TypeReference,
} from "typescript/sync";
import * as is from "typescript/ast/is";
import type { Checker, Type as TsType } from "typescript/sync";

const typeLookupCache = new WeakMap<ts.SourceFile, TypeLookup>();
const nodeTypeTextCache = new WeakMap<ts.Node, WeakMap<Checker, string | undefined>>();
const parsedTypeTextCache = new WeakMap<ts.Node, WeakMap<Checker, string | undefined>>();
const typeAtLocationCache = new WeakMap<ts.Node, WeakMap<Checker, TsType>>();

/** The type at a node. Each checker query is a round trip, so repeated lookups are shared. */
export function typeAtLocation(node: ts.Node, checker: Checker): TsType {
  const byChecker = typeAtLocationCache.get(node);
  const cached = byChecker?.get(checker);
  if (cached) return cached;
  const type = checker.getTypeAtLocation(node);
  const next = byChecker ?? new WeakMap<Checker, TsType>();
  next.set(checker, type);
  if (!byChecker) typeAtLocationCache.set(node, next);
  return type;
}

/** Stores a type that was already fetched elsewhere (for example in a batched request). */
export function primeTypeAtLocation(node: ts.Node, checker: Checker, type: TsType): void {
  const byChecker = typeAtLocationCache.get(node) ?? new WeakMap<Checker, TsType>();
  byChecker.set(checker, type);
  typeAtLocationCache.set(node, byChecker);
}

const INTRINSIC_TEXT_FLAGS =
  TypeFlags.String |
  TypeFlags.Number |
  TypeFlags.BigInt |
  TypeFlags.ESSymbol |
  TypeFlags.Void |
  TypeFlags.Undefined |
  TypeFlags.Null |
  TypeFlags.Never |
  TypeFlags.Unknown |
  TypeFlags.Any;

const typeTextCache = new WeakMap<TsType, string>();
const fullTypeTextCache = new WeakMap<TsType, string>();

/** The type's own name when it is a plain intrinsic, which the type object carries locally. */
function intrinsicTypeText(type: TsType): string | undefined {
  if (!(type.flags & INTRINSIC_TEXT_FLAGS)) return undefined;
  const name = (type as { intrinsicName?: string }).intrinsicName;
  return name && name !== "error" ? name : undefined;
}

/**
 * Text of a type as the checker prints it. Every call to the checker is a round trip to the
 * compiler process, so intrinsic names are read locally and results are kept per type object.
 */
export function typeToText(type: TsType, checker: Checker, noTruncation = false): string {
  const cache = noTruncation ? fullTypeTextCache : typeTextCache;
  const cached = cache.get(type);
  if (cached !== undefined) return cached;
  const text =
    intrinsicTypeText(type) ??
    (noTruncation
      ? checker.typeToString(type, undefined, TypeFormatFlags.NoTruncation)
      : checker.typeToString(type));
  cache.set(type, text);
  return text;
}

const MAX_EXPANDED_TYPE_LENGTH = 100_000;
const MAX_EXPANDED_TYPE_PROPERTIES = 500;

type FormatState = {
  visited: Set<TsType>;
  remaining: number;
};

/**
 * Shared type extraction helper used by detectors.
 *
 * Priority:
 * 1) Explicit type annotation text
 * 2) TypeChecker inference at node location
 */
export function getNodeTypeText(node: ts.Node, checker: Checker): string | undefined {
  const maybeTyped = node as { type?: ts.TypeNode };
  if (maybeTyped.type) {
    const text = normalizeTypeText(maybeTyped.type.getText());
    if (text) return text;
  }

  try {
    const cachedByChecker = nodeTypeTextCache.get(node);
    if (cachedByChecker?.has(checker)) return cachedByChecker.get(checker);
    const type = typeAtLocation(node, checker);
    const text = typeToText(type, checker).trim();
    const result = !text || text === "any" || text === "unknown" ? undefined : text;
    const byChecker = nodeTypeTextCache.get(node) ?? new WeakMap<Checker, string | undefined>();
    byChecker.set(checker, result);
    nodeTypeTextCache.set(node, byChecker);
    return result;
  } catch {
    return undefined;
  }
}

export function normalizeTypeText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^\s*\|\s*/, "")
    .trim();
}

/**
 * Expanded/parsed type text for alias-heavy APIs.
 *
 * Example: `Target | undefined` -> `'a' | 'b' | undefined`
 */
export function getParsedTypeText(node: ts.Node, checker: Checker): string | undefined {
  try {
    const annotation = (node as { type?: ts.TypeNode }).type;
    if (annotation && isOpaqueTypeReference(annotation, checker)) return undefined;
    const cachedByChecker = parsedTypeTextCache.get(node);
    if (cachedByChecker?.has(checker)) return cachedByChecker.get(checker);
    const type = typeAtLocation(node, checker);
    const expanded = getParsedTypeTextFromType(type, checker);
    const result = expanded || undefined;
    const byChecker = parsedTypeTextCache.get(node) ?? new WeakMap<Checker, string | undefined>();
    byChecker.set(checker, result);
    parsedTypeTextCache.set(node, byChecker);
    return result;
  } catch {
    return undefined;
  }
}

function isOpaqueTypeReference(node: ts.TypeNode, checker: Checker): boolean {
  if (!is.isTypeReferenceNode(node)) return false;
  const symbol = checker.getSymbolAtLocation(node.typeName);
  return hasLibraryDeclaration(symbol);
}

export function getParsedTypeTextFromType(type: TsType, checker: Checker): string {
  const state: FormatState = { visited: new Set(), remaining: MAX_EXPANDED_TYPE_LENGTH };
  return normalizeUnionText(formatType(type, checker, state, 0));
}

export function areTypeTextsEquivalent(
  first: string | undefined,
  second: string | undefined,
  options: { ignoreUndefined?: boolean } = {},
): boolean {
  if (!first || !second) return false;
  return canonicalizeTypeText(first, options) === canonicalizeTypeText(second, options);
}

function canonicalizeTypeText(text: string, options: { ignoreUndefined?: boolean }): string {
  const normalized = stripOuterParentheses(text.trim())
    .replace(/\s+/g, " ")
    .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, "'$1'");
  const union = splitTopLevelOperator(normalized, "|");
  if (union.length > 1) {
    const parts = union
      .map((part) => canonicalizeTypeText(part, options))
      .filter((part) => part && (!options.ignoreUndefined || part !== "undefined"))
      .sort();
    if (parts.includes("true") && parts.includes("false")) {
      return [...parts.filter((part) => part !== "true" && part !== "false"), "boolean"]
        .sort()
        .join("|");
    }
    return parts.join("|");
  }

  const intersection = splitTopLevelOperator(normalized, "&");
  if (intersection.length > 1) {
    return intersection
      .map((part) => canonicalizeTypeText(part, options))
      .sort()
      .join("&");
  }

  return normalized.replace(/\s*;\s*}/g, "}").replace(/\s*;\s*$/g, "");
}

function stripOuterParentheses(text: string): string {
  if (!text.startsWith("(") || !text.endsWith(")")) return text;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    if (text[index] === ")") depth -= 1;
    if (depth === 0 && index < text.length - 1) return text;
  }
  return text.slice(1, -1).trim();
}

function splitTopLevelOperator(text: string, operator: "|" | "&"): string[] {
  const parts: string[] = [];
  let start = 0;
  let angle = 0;
  let curly = 0;
  let square = 0;
  let paren = 0;
  let quote: string | undefined;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote && text[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "<") angle += 1;
    else if (character === ">" && angle > 0) angle -= 1;
    else if (character === "{") curly += 1;
    else if (character === "}" && curly > 0) curly -= 1;
    else if (character === "[") square += 1;
    else if (character === "]" && square > 0) square -= 1;
    else if (character === "(") paren += 1;
    else if (character === ")" && paren > 0) paren -= 1;
    else if (character === operator && angle === 0 && curly === 0 && square === 0 && paren === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }

  if (parts.length === 0) return [text];
  parts.push(text.slice(start).trim());
  return parts;
}

export function resolveParsedTypeFromText(
  typeText: string | undefined,
  sourceFile: ts.SourceFile,
  checker: Checker,
): string | undefined {
  if (!typeText) return undefined;
  const parts = splitUnion(typeText)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;

  const resolved = parts.map((part) => {
    if (isPrimitiveOrLiteral(part)) return part;
    const node = findTypeNodeWithImports(sourceFile, part, checker);
    if (!node) return part;
    try {
      const type = is.isTypeAliasDeclaration(node)
        ? checker.getTypeFromTypeNode(node.type)
        : typeAtLocation((node as { name?: ts.Node }).name ?? node, checker);
      return getParsedTypeTextFromType(type, checker);
    } catch {
      return part;
    }
  });

  return normalizeUnionText(resolved.join(" | "));
}

export function resolveMeaningfulParsedTypeFromText(
  typeText: string | undefined,
  sourceFile: ts.SourceFile,
  checker: Checker,
): string | undefined {
  const resolved = resolveParsedTypeFromText(typeText, sourceFile, checker);
  return resolved && !areTypeTextsEquivalent(resolved, typeText, { ignoreUndefined: true })
    ? resolved
    : undefined;
}

function formatType(type: TsType, checker: Checker, state: FormatState, depth: number): string {
  if (state.remaining <= 0) return "unknown";
  if (depth > 8 || state.visited.has(type)) {
    return safeTypeToString(type, checker);
  }
  state.visited.add(type);

  if (isUnionType(type)) {
    const parts = type.getTypes().map((t) => formatType(t, checker, state, depth + 1));
    return normalizeUnionParts(parts).join(" | ");
  }

  if (isIntersectionType(type)) {
    return type
      .getTypes()
      .map((t) => formatType(t, checker, state, depth + 1))
      .join(" & ");
  }

  if (type.flags & TypeFlags.StringLiteral) {
    const value = (type as LiteralType).value as string;
    return `'${value}'`;
  }

  if (type.flags & TypeFlags.NumberLiteral || type.flags & TypeFlags.BigIntLiteral) {
    return String((type as LiteralType).value);
  }

  if (type.flags & TypeFlags.BooleanLiteral) {
    const intrinsic = (type as { intrinsicName?: string }).intrinsicName;
    return intrinsic === "true" || intrinsic === "false" ? intrinsic : "boolean";
  }

  // Keep framework/library types opaque, including imported aliases, so
  // declarations from Lit, FAST, Preact, and similar packages are not expanded.
  if (
    (type.getSymbol() || type.getAliasSymbol()) &&
    (isOpaqueLibraryType(type) || isClassType(type))
  ) {
    return safeTypeToString(type, checker);
  }

  const aliasSymbol = type.getAliasSymbol();
  if (aliasSymbol) {
    const aliasDeclared = checker.getDeclaredTypeOfSymbol(aliasSymbol);
    if (aliasDeclared && aliasDeclared !== type) {
      return formatType(aliasDeclared, checker, state, depth + 1);
    }
  }

  // Arrays and tuples are object type references; skip the checker round trips for anything else.
  const isTypeReference =
    !!(type.flags & TypeFlags.Object) &&
    !!((type as ObjectType).objectFlags & ObjectFlags.Reference);

  if (isTypeReference && checker.isArrayType?.(type)) {
    const [element] = checker.getTypeArguments(type as TypeReference);
    if (!element) return "unknown[]";
    return `${formatType(element, checker, state, depth + 1)}[]`;
  }

  if (isTypeReference && checker.isTupleType?.(type)) {
    const args = checker.getTypeArguments(type as TypeReference);
    return `[${args.map((t) => formatType(t, checker, state, depth + 1)).join(", ")}]`;
  }

  if (type.flags & TypeFlags.Object) {
    const props = checker.getPropertiesOfType(type);
    if (props.length > 0) {
      const members = props.slice(0, MAX_EXPANDED_TYPE_PROPERTIES).map((prop) => {
        const decl = primaryDeclaration(prop);
        if (!decl) return `${prop.name}: unknown`;
        const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
        const optional = (prop.flags & SymbolFlags.Optional) !== 0 ? "?" : "";
        state.remaining -= prop.name.length + 8;
        return `${prop.name}${optional}: ${formatType(propType, checker, state, depth + 1)}`;
      });
      if (props.length > MAX_EXPANDED_TYPE_PROPERTIES) members.push("...: unknown");
      return `{ ${members.join("; ")} }`;
    }
  }

  return safeTypeToString(type, checker);
}

function safeTypeToString(type: TsType, checker: Checker): string {
  try {
    const text = typeToText(type, checker, true);
    return text.length <= MAX_EXPANDED_TYPE_LENGTH ? text : "unknown";
  } catch {
    return "unknown";
  }
}

function isOpaqueLibraryType(type: TsType): boolean {
  return hasLibraryDeclaration(type.getSymbol()) || hasLibraryDeclaration(type.getAliasSymbol());
}

function isClassType(type: TsType): boolean {
  return hasDeclarationOfKind(type.getSymbol(), [
    ts.SyntaxKind.ClassDeclaration,
    ts.SyntaxKind.ClassExpression,
  ]);
}

function normalizeUnionText(text: string): string {
  const parts = splitUnion(text)
    .map((p) => p.trim())
    .filter(Boolean);
  return normalizeUnionParts(parts).join(" | ");
}

function normalizeUnionParts(parts: string[]): string[] {
  const hasUndefined = parts.includes("undefined");
  const withoutUndefined = parts.filter((p) => p !== "undefined");
  const boolLikeCount = withoutUndefined.filter(
    (p) => p === "true" || p === "false" || p === "boolean",
  ).length;
  const other = withoutUndefined.filter((p) => p !== "true" && p !== "false" && p !== "boolean");

  if (boolLikeCount > 0 && other.length === 0) {
    return hasUndefined ? ["boolean", "undefined"] : ["boolean"];
  }

  const ordered = [...withoutUndefined];
  if (hasUndefined) ordered.push("undefined");
  return ordered;
}

function splitUnion(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'" && !inDouble && text[i - 1] !== "\\") inSingle = !inSingle;
    if (ch === '"' && !inSingle && text[i - 1] !== "\\") inDouble = !inDouble;
    if (ch === "|" && !inSingle && !inDouble) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

function findTypeNodeWithImports(
  sourceFile: ts.SourceFile,
  name: string,
  checker: Checker,
): ts.Node | undefined {
  let lookup = typeLookupCache.get(sourceFile);
  if (!lookup) {
    lookup = buildTypeLookup(sourceFile);
    typeLookupCache.set(sourceFile, lookup);
  }

  return lookupType(lookup, name, checker);
}

type TypeLookup = {
  declared: Map<string, ts.Node>;
  imported: Map<string, ts.Identifier>;
  resolvedImports: Map<string, ts.Node | undefined>;
};

function lookupType(lookup: TypeLookup, name: string, checker: Checker): ts.Node | undefined {
  const declared = lookup.declared.get(name);
  if (declared) return declared;
  const importName = lookup.imported.get(name);
  if (!importName) return undefined;
  if (!lookup.resolvedImports.has(name)) {
    lookup.resolvedImports.set(name, resolveImportSpecifierSymbol(importName, checker));
  }
  return lookup.resolvedImports.get(name);
}

/** Imports are only resolved (a checker round trip each) when a name is actually looked up. */
function buildTypeLookup(sourceFile: ts.SourceFile): TypeLookup {
  const declared = new Map<string, ts.Node>();
  const imported = new Map<string, ts.Identifier>();

  const visit = (node: ts.Node) => {
    if (
      (is.isTypeAliasDeclaration(node) ||
        is.isInterfaceDeclaration(node) ||
        is.isEnumDeclaration(node) ||
        is.isClassDeclaration(node)) &&
      node.name
    ) {
      if (!declared.has(node.name.text)) declared.set(node.name.text, node);
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);

  for (const stmt of sourceFile.statements) {
    if (!is.isImportDeclaration(stmt) || !stmt.importClause) continue;

    if (stmt.importClause.name && !imported.has(stmt.importClause.name.text)) {
      imported.set(stmt.importClause.name.text, stmt.importClause.name);
    }

    const bindings = stmt.importClause.namedBindings;
    if (!bindings || !is.isNamedImports(bindings)) continue;
    for (const spec of bindings.elements) {
      if (!imported.has(spec.name.text)) imported.set(spec.name.text, spec.name);
    }
  }

  return { declared, imported, resolvedImports: new Map() };
}

function resolveImportSpecifierSymbol(node: ts.Identifier, checker: Checker): ts.Node | undefined {
  const sym = checker.getSymbolAtLocation(node);
  if (!sym) return undefined;

  const resolved = (sym.flags & SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(sym) : sym;
  const declarations = symbolDeclarations(resolved, [
    ts.SyntaxKind.TypeAliasDeclaration,
    ts.SyntaxKind.InterfaceDeclaration,
    ts.SyntaxKind.EnumDeclaration,
    ts.SyntaxKind.ClassDeclaration,
  ]);
  return declarations.find(
    (decl) =>
      is.isTypeAliasDeclaration(decl) ||
      is.isInterfaceDeclaration(decl) ||
      is.isEnumDeclaration(decl) ||
      is.isClassDeclaration(decl),
  );
}

function isPrimitiveOrLiteral(text: string): boolean {
  if (
    [
      "string",
      "number",
      "boolean",
      "any",
      "unknown",
      "undefined",
      "null",
      "void",
      "never",
      "object",
    ].includes(text)
  ) {
    return true;
  }
  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('"') && text.endsWith('"'))
  ) {
    return true;
  }
  return /^\d+(?:\.\d+)?$/.test(text);
}
