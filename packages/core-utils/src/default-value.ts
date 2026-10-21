import ts from "typescript";

/**
 * Returns source text for defaults that can be stated exactly in a manifest.
 * Computed expressions are omitted rather than serialized as executable source.
 */
export function getLiteralDefaultText(
  expression: ts.Expression | undefined,
  checker: ts.TypeChecker,
): string | undefined {
  if (!expression) return undefined;

  if (ts.isNoSubstitutionTemplateLiteral(expression)) return expression.getText();

  if (
    ts.isStringLiteral(expression) ||
    ts.isNumericLiteral(expression) ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword ||
    expression.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isPrefixUnaryExpression(expression) &&
      (expression.operator === ts.SyntaxKind.PlusToken ||
        expression.operator === ts.SyntaxKind.MinusToken) &&
      ts.isNumericLiteral(expression.operand))
  ) {
    return expression.getText();
  }

  if (!ts.isIdentifier(expression)) return undefined;

  const symbol = resolveSymbol(checker.getSymbolAtLocation(expression), checker);
  const declaration = symbol?.valueDeclaration;
  if (!isConstVariable(declaration)) return undefined;

  const type = checker.getTypeAtLocation(expression);
  if (type.flags & ts.TypeFlags.StringLiteral) {
    return (
      getStringLiteralSource(declaration.initializer, checker) ??
      JSON.stringify((type as ts.StringLiteralType).value)
    );
  }
  if (type.flags & ts.TypeFlags.NumberLiteral) {
    return String((type as ts.NumberLiteralType).value);
  }

  return undefined;
}

function getStringLiteralSource(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seen = new Set<ts.Symbol>(),
): string | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.getText();
  }

  if (
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return getStringLiteralSource(expression.expression, checker, seen);
  }

  if (!ts.isIdentifier(expression)) return undefined;
  const symbol = resolveSymbol(checker.getSymbolAtLocation(expression), checker);
  const declaration = symbol?.valueDeclaration;
  if (!symbol || seen.has(symbol) || !isConstVariable(declaration)) return undefined;

  seen.add(symbol);
  return getStringLiteralSource(declaration.initializer, checker, seen);
}

function resolveSymbol(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  if (!symbol) return undefined;
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function isConstVariable(
  declaration: ts.Declaration | undefined,
): declaration is ts.VariableDeclaration & { initializer: ts.Expression } {
  return (
    !!declaration &&
    ts.isVariableDeclaration(declaration) &&
    !!declaration.initializer &&
    ts.isVariableDeclarationList(declaration.parent) &&
    !!(declaration.parent.flags & ts.NodeFlags.Const)
  );
}
