import * as ts from "typescript/ast";
import { typeAtLocation } from "./type-parser.js";
import { primaryDeclaration } from "./node-utils.js";
import { NumberLiteralType, StringLiteralType, SymbolFlags, TypeFlags } from "typescript/sync";
import * as is from "typescript/ast/is";
import type { Checker, Symbol as TsSymbol } from "typescript/sync";

/**
 * Returns source text for defaults that can be stated exactly in a manifest.
 * Computed expressions are omitted rather than serialized as executable source.
 */
export function getLiteralDefaultText(
  expression: ts.Expression | undefined,
  checker: Checker,
): string | undefined {
  if (!expression) return undefined;

  if (is.isNoSubstitutionTemplateLiteral(expression)) return expression.getText();

  if (
    is.isStringLiteral(expression) ||
    is.isNumericLiteral(expression) ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword ||
    expression.kind === ts.SyntaxKind.NullKeyword ||
    (is.isPrefixUnaryExpression(expression) &&
      (expression.operator === ts.SyntaxKind.PlusToken ||
        expression.operator === ts.SyntaxKind.MinusToken) &&
      is.isNumericLiteral(expression.operand))
  ) {
    return expression.getText();
  }

  if (!is.isIdentifier(expression)) return undefined;

  const symbol = resolveSymbol(checker.getSymbolAtLocation(expression), checker);
  const declaration = primaryDeclaration(symbol);
  if (!isConstVariable(declaration)) return undefined;

  const type = typeAtLocation(expression, checker);
  if (type.flags & TypeFlags.StringLiteral) {
    return (
      getStringLiteralSource(declaration.initializer, checker) ??
      JSON.stringify((type as StringLiteralType).value)
    );
  }
  if (type.flags & TypeFlags.NumberLiteral) {
    return String((type as NumberLiteralType).value);
  }

  return undefined;
}

function getStringLiteralSource(
  expression: ts.Expression,
  checker: Checker,
  seen = new Set<TsSymbol>(),
): string | undefined {
  if (is.isStringLiteral(expression) || is.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.getText();
  }

  if (
    is.isAsExpression(expression) ||
    is.isTypeAssertion(expression) ||
    is.isNonNullExpression(expression) ||
    is.isParenthesizedExpression(expression) ||
    is.isSatisfiesExpression(expression)
  ) {
    return getStringLiteralSource(expression.expression, checker, seen);
  }

  if (!is.isIdentifier(expression)) return undefined;
  const symbol = resolveSymbol(checker.getSymbolAtLocation(expression), checker);
  const declaration = primaryDeclaration(symbol);
  if (!symbol || seen.has(symbol) || !isConstVariable(declaration)) return undefined;

  seen.add(symbol);
  return getStringLiteralSource(declaration.initializer, checker, seen);
}

function resolveSymbol(symbol: TsSymbol | undefined, checker: Checker): TsSymbol | undefined {
  if (!symbol) return undefined;
  return symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function isConstVariable(
  declaration: ts.Declaration | undefined,
): declaration is ts.VariableDeclaration & { initializer: ts.Expression } {
  return (
    !!declaration &&
    is.isVariableDeclaration(declaration) &&
    !!declaration.initializer &&
    is.isVariableDeclarationList(declaration.parent) &&
    !!(declaration.parent.flags & ts.NodeFlags.Const)
  );
}
