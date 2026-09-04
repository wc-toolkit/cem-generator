import ts from "typescript";

const typeLookupCache = new WeakMap<ts.SourceFile, Map<string, ts.Node>>();

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
    const text = maybeTyped.type.getText().trim();
    if (text) return text;
  }

  try {
    const type = checker.getTypeAtLocation(node);
    const text = checker.typeToString(type).trim();
    if (!text || text === "any" || text === "unknown") return undefined;
    return text;
  } catch {
    return undefined;
  }
}

/**
 * Expanded/parsed type text for alias-heavy APIs.
 *
 * Example: `Target | undefined` -> `'a' | 'b' | undefined`
 */
export function getParsedTypeText(node: ts.Node, checker: ts.TypeChecker): string | undefined {
  try {
    const type = checker.getTypeAtLocation(node);
    const expanded = getParsedTypeTextFromType(type, checker);
    return expanded || undefined;
  } catch {
    return undefined;
  }
}

export function getParsedTypeTextFromType(type: ts.Type, checker: ts.TypeChecker): string {
  return normalizeUnionText(formatType(type, checker, new Set(), 0));
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

function formatType(
  type: ts.Type,
  checker: ts.TypeChecker,
  visited: Set<ts.Type>,
  depth: number
): string {
  if (depth > 8 || visited.has(type)) {
    return checker.typeToString(type);
  }
  visited.add(type);

  if (type.isUnion()) {
    const parts = type.types.map((t) => formatType(t, checker, visited, depth + 1));
    return normalizeUnionParts(parts).join(" | ");
  }

  if (type.isIntersection()) {
    return type.types.map((t) => formatType(t, checker, visited, depth + 1)).join(" & ");
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

  if (type.aliasSymbol) {
    const aliasDeclared = checker.getDeclaredTypeOfSymbol(type.aliasSymbol);
    if (aliasDeclared && aliasDeclared !== type) {
      return formatType(aliasDeclared, checker, visited, depth + 1);
    }
  }

  if (checker.isArrayType?.(type)) {
    const [element] = checker.getTypeArguments(type as ts.TypeReference);
    if (!element) return "unknown[]";
    return `${formatType(element, checker, visited, depth + 1)}[]`;
  }

  if (checker.isTupleType?.(type)) {
    const args = checker.getTypeArguments(type as ts.TypeReference);
    return `[${args.map((t) => formatType(t, checker, visited, depth + 1)).join(", ")}]`;
  }

  if (type.flags & ts.TypeFlags.Object) {
    const props = checker.getPropertiesOfType(type);
    if (props.length > 0) {
      const members = props.map((prop) => {
        const decl = prop.valueDeclaration ?? prop.getDeclarations()?.[0];
        if (!decl) return `${prop.name}: unknown`;
        const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
        const optional = (prop.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : "";
        return `${prop.name}${optional}: ${formatType(propType, checker, visited, depth + 1)}`;
      });
      return `{ ${members.join("; ")} }`;
    }
  }

  return checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
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
