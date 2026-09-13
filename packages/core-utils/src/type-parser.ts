import ts from "typescript";

const typeLookupCache = new WeakMap<ts.SourceFile, Map<string, ts.Node>>();
const nodeTypeTextCache = new WeakMap<ts.Node, WeakMap<ts.TypeChecker, string | undefined>>();
const parsedTypeTextCache = new WeakMap<ts.Node, WeakMap<ts.TypeChecker, string | undefined>>();
const MAX_EXPANDED_TYPE_LENGTH = 100_000;
const MAX_EXPANDED_TYPE_PROPERTIES = 500;

type FormatState = {
  visited: Set<ts.Type>;
  remaining: number;
};

/**
 * Shared type extraction helper used by detectors.
 *
 * Priority:
 * 1) Explicit type annotation text
 * 2) TypeChecker inference at node location
 */
export function getNodeTypeText(node: ts.Node, checker: ts.TypeChecker): string | undefined {
  const maybeTyped = node as { type?: ts.TypeNode };
  if (maybeTyped.type) {
    const text = normalizeTypeText(maybeTyped.type.getText());
    if (text) return text;
  }

  try {
    const cachedByChecker = nodeTypeTextCache.get(node);
    if (cachedByChecker?.has(checker)) return cachedByChecker.get(checker);
    const type = checker.getTypeAtLocation(node);
    const text = checker.typeToString(type).trim();
    const result = !text || text === "any" || text === "unknown" ? undefined : text;
    const byChecker = nodeTypeTextCache.get(node) ?? new WeakMap<ts.TypeChecker, string | undefined>();
    byChecker.set(checker, result);
    nodeTypeTextCache.set(node, byChecker);
    return result;
  } catch {
    return undefined;
  }
}

export function normalizeTypeText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/^\s*\|\s*/, "").trim();
}

/**
 * Expanded/parsed type text for alias-heavy APIs.
 *
 * Example: `Target | undefined` -> `'a' | 'b' | undefined`
 */
export function getParsedTypeText(node: ts.Node, checker: ts.TypeChecker): string | undefined {
  try {
    const annotation = (node as { type?: ts.TypeNode }).type;
    if (annotation && isOpaqueTypeReference(annotation, checker)) return undefined;
    const cachedByChecker = parsedTypeTextCache.get(node);
    if (cachedByChecker?.has(checker)) return cachedByChecker.get(checker);
    const type = checker.getTypeAtLocation(node);
    const expanded = getParsedTypeTextFromType(type, checker);
    const result = expanded || undefined;
    const byChecker = parsedTypeTextCache.get(node) ?? new WeakMap<ts.TypeChecker, string | undefined>();
    byChecker.set(checker, result);
    parsedTypeTextCache.set(node, byChecker);
    return result;
  } catch {
    return undefined;
  }
}

function isOpaqueTypeReference(node: ts.TypeNode, checker: ts.TypeChecker): boolean {
  if (!ts.isTypeReferenceNode(node)) return false;
  const symbol = checker.getSymbolAtLocation(node.typeName);
  return symbol?.declarations?.some((declaration) => {
    const fileName = declaration.getSourceFile().fileName;
    return declaration.getSourceFile().isDeclarationFile && /[\\/]node_modules[\\/]|[\\/]lib\.[^/\\]+\.d\.ts$/.test(fileName);
  }) ?? false;
}

export function getParsedTypeTextFromType(type: ts.Type, checker: ts.TypeChecker): string {
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
      return [...parts.filter((part) => part !== "true" && part !== "false"), "boolean"].sort().join("|");
    }
    return parts.join("|");
  }

  const intersection = splitTopLevelOperator(normalized, "&");
  if (intersection.length > 1) {
    return intersection.map((part) => canonicalizeTypeText(part, options)).sort().join("&");
  }

  return normalized
    .replace(/\s*;\s*}/g, "}")
    .replace(/\s*;\s*$/g, "");
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
  checker: ts.TypeChecker
): string | undefined {
  if (!typeText) return undefined;
  const parts = splitUnion(typeText).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;

  const resolved = parts.map((part) => {
    if (isPrimitiveOrLiteral(part)) return part;
    const node = findTypeNodeWithImports(sourceFile, part, checker);
    if (!node) return part;
    try {
      const type = ts.isTypeAliasDeclaration(node)
        ? checker.getTypeFromTypeNode(node.type)
        : checker.getTypeAtLocation((node as { name?: ts.Node }).name ?? node);
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
  checker: ts.TypeChecker,
): string | undefined {
  const resolved = resolveParsedTypeFromText(typeText, sourceFile, checker);
  return resolved && !areTypeTextsEquivalent(resolved, typeText, { ignoreUndefined: true }) ? resolved : undefined;
}

function formatType(
  type: ts.Type,
  checker: ts.TypeChecker,
  state: FormatState,
  depth: number
): string {
  if (state.remaining <= 0) return "unknown";
  if (depth > 8 || state.visited.has(type)) {
    return safeTypeToString(type, checker);
  }
  state.visited.add(type);

  if (type.isUnion()) {
    const parts = type.types.map((t) => formatType(t, checker, state, depth + 1));
    return normalizeUnionParts(parts).join(" | ");
  }

  if (type.isIntersection()) {
    return type.types.map((t) => formatType(t, checker, state, depth + 1)).join(" & ");
  }

  if (type.flags & ts.TypeFlags.StringLiteral) {
    const value = (type as ts.LiteralType).value as string;
    return `'${value}'`;
  }

  if (type.flags & ts.TypeFlags.NumberLiteral || type.flags & ts.TypeFlags.BigIntLiteral) {
    return String((type as ts.LiteralType).value);
  }

  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    const intrinsic = (type as { intrinsicName?: string }).intrinsicName;
    return intrinsic === "true" || intrinsic === "false" ? intrinsic : "boolean";
  }

  // Keep framework/library types opaque, including imported aliases, so
  // declarations from Lit, FAST, Preact, and similar packages are not expanded.
  if ((type.symbol || type.aliasSymbol) && (isOpaqueLibraryType(type) || isClassType(type))) {
    return safeTypeToString(type, checker);
  }

  if (type.aliasSymbol) {
    const aliasDeclared = checker.getDeclaredTypeOfSymbol(type.aliasSymbol);
    if (aliasDeclared && aliasDeclared !== type) {
      return formatType(aliasDeclared, checker, state, depth + 1);
    }
  }

  if (checker.isArrayType?.(type)) {
    const [element] = checker.getTypeArguments(type as ts.TypeReference);
    if (!element) return "unknown[]";
    return `${formatType(element, checker, state, depth + 1)}[]`;
  }

  if (checker.isTupleType?.(type)) {
    const args = checker.getTypeArguments(type as ts.TypeReference);
    return `[${args.map((t) => formatType(t, checker, state, depth + 1)).join(", ")}]`;
  }

  if (type.flags & ts.TypeFlags.Object) {
    const props = checker.getPropertiesOfType(type);
    if (props.length > 0) {
      const members = props.slice(0, MAX_EXPANDED_TYPE_PROPERTIES).map((prop) => {
        const decl = prop.valueDeclaration ?? prop.getDeclarations()?.[0];
        if (!decl) return `${prop.name}: unknown`;
        const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
        const optional = (prop.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : "";
        state.remaining -= prop.name.length + 8;
        return `${prop.name}${optional}: ${formatType(propType, checker, state, depth + 1)}`;
      });
      if (props.length > MAX_EXPANDED_TYPE_PROPERTIES) members.push("...: unknown");
      return `{ ${members.join("; ")} }`;
    }
  }

  return safeTypeToString(type, checker);
}

function safeTypeToString(type: ts.Type, checker: ts.TypeChecker): string {
  try {
    const text = checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
    return text.length <= MAX_EXPANDED_TYPE_LENGTH ? text : "unknown";
  } catch {
    return "unknown";
  }
}

function isOpaqueLibraryType(type: ts.Type): boolean {
  const declarations = [
    ...(type.symbol?.declarations ?? []),
    ...(type.aliasSymbol?.declarations ?? []),
  ];
  return declarations.some((declaration) => {
    const fileName = declaration.getSourceFile().fileName;
    return (
      declaration.getSourceFile().isDeclarationFile &&
      (/[\\/]lib\.[^/\\]+\.d\.ts$/.test(fileName) || /[\\/]node_modules[\\/]/.test(fileName))
    );
  }) ?? false;
}

function isClassType(type: ts.Type): boolean {
  return type.symbol?.declarations?.some(
    (declaration) => ts.isClassDeclaration(declaration) || ts.isClassExpression(declaration),
  ) ?? false;
}

function normalizeUndefinedLast(text: string): string {
  const parts = splitUnion(text);
  if (!parts.includes("undefined")) return text;
  return [...parts.filter((p) => p !== "undefined"), "undefined"].join(" | ");
}

function normalizeUnionText(text: string): string {
  const parts = splitUnion(text).map((p) => p.trim()).filter(Boolean);
  return normalizeUnionParts(parts).join(" | ");
}

function normalizeUnionParts(parts: string[]): string[] {
  const hasUndefined = parts.includes("undefined");
  const withoutUndefined = parts.filter((p) => p !== "undefined");
  const boolLikeCount = withoutUndefined.filter((p) => p === "true" || p === "false" || p === "boolean").length;
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

function findLocalTypeNode(sourceFile: ts.SourceFile, name: string): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (
      (
        ts.isTypeAliasDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isClassDeclaration(node)
      ) &&
      node.name &&
      node.name.text === name
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return found;
}

function findTypeNodeWithImports(
  sourceFile: ts.SourceFile,
  name: string,
  checker: ts.TypeChecker
): ts.Node | undefined {
  let lookup = typeLookupCache.get(sourceFile);
  if (!lookup) {
    lookup = buildTypeLookup(sourceFile, checker);
    typeLookupCache.set(sourceFile, lookup);
  }

  return lookup.get(name);
}

function buildTypeLookup(sourceFile: ts.SourceFile, checker: ts.TypeChecker): Map<string, ts.Node> {
  const lookup = new Map<string, ts.Node>();

  const add = (name: string, node: ts.Node) => {
    if (!lookup.has(name)) lookup.set(name, node);
  };

  const visit = (node: ts.Node) => {
    if (
      (
        ts.isTypeAliasDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isClassDeclaration(node)
      ) &&
      node.name
    ) {
      add(node.name.text, node);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;

    if (stmt.importClause.name) {
      const resolved = resolveImportSpecifierSymbol(stmt.importClause.name, checker);
      if (resolved) add(stmt.importClause.name.text, resolved);
    }

    const bindings = stmt.importClause.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const spec of bindings.elements) {
      const resolved = resolveImportSpecifierSymbol(spec.name, checker);
      if (resolved) add(spec.name.text, resolved);
    }
  }

  return lookup;
}

function resolveImportSpecifierSymbol(node: ts.Identifier, checker: ts.TypeChecker): ts.Node | undefined {
  const sym = checker.getSymbolAtLocation(node);
  if (!sym) return undefined;

  const resolved = (sym.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(sym) : sym;
  const declarations = resolved.getDeclarations() ?? [];
  return declarations.find(
    (decl) =>
      ts.isTypeAliasDeclaration(decl) ||
      ts.isInterfaceDeclaration(decl) ||
      ts.isEnumDeclaration(decl) ||
      ts.isClassDeclaration(decl)
  );
}

function isPrimitiveOrLiteral(text: string): boolean {
  if (
    ["string", "number", "boolean", "any", "unknown", "undefined", "null", "void", "never", "object"].includes(
      text
    )
  ) {
    return true;
  }
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return true;
  }
  return /^\d+(?:\.\d+)?$/.test(text);
}
