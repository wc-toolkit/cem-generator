import * as ts from "typescript/ast";
import { symbolDeclarations } from "./node-utils.js";
import { SymbolFlags } from "typescript/sync";
import * as is from "typescript/ast/is";
import type { Checker, Symbol as TsSymbol } from "typescript/sync";

/** What an `extends` clause expression resolves to, for a matcher to inspect. */
export interface HeritageMatch {
  /** The expression in the `extends` clause, as written. */
  expression: ts.Expression;
  /** The expression's symbol, resolved through an import alias when it is one. */
  symbol: TsSymbol | undefined;
  /** The class the symbol declares, when it declares one. */
  declaration: ts.ClassDeclaration | ts.ClassExpression | undefined;
  checker: Checker;
}

export type HeritageMatcher = (match: HeritageMatch) => boolean;

/**
 * Whether a class extends a base class matching `matches`, at any depth and
 * across files.
 *
 * The traversal follows identifiers and property accesses to their declarations
 * by the type checker, so a custom base class declared in another module is
 * found without knowing that module. A mixin call, as
 * `extends WithTheme(CardBase)`, is followed through its arguments. A cycle of
 * classes extending each other stops at the first base it has already seen.
 */
export function inheritsFrom(
  node: ts.ClassLikeDeclaration,
  checker: Checker,
  matches: HeritageMatcher,
): boolean {
  const heritage = node.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
  );
  if (!heritage) return false;

  const seen = new Set<ts.Node>();
  const visit = (expression: ts.Expression): boolean => {
    if (seen.has(expression)) return false;
    seen.add(expression);

    if (is.isCallExpression(expression)) return expression.arguments.some(visit);
    if (!is.isIdentifier(expression) && !is.isPropertyAccessExpression(expression)) return false;

    const symbol = checker.getSymbolAtLocation(expression);
    const resolved =
      symbol && symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const declaration = symbolDeclarations(resolved, [
      ts.SyntaxKind.ClassDeclaration,
      ts.SyntaxKind.ClassExpression,
    ]).find(
      (item): item is ts.ClassDeclaration | ts.ClassExpression =>
        is.isClassDeclaration(item) || is.isClassExpression(item),
    );

    if (matches({ expression, symbol: resolved, declaration, checker })) return true;

    const base = declaration?.heritageClauses?.find(
      (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
    );
    return !!base?.types[0] && visit((base.types[0] as ts.ExpressionWithTypeArguments).expression);
  };

  return heritage.types.some((type) => visit((type as ts.ExpressionWithTypeArguments).expression));
}
