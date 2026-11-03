import ts from "typescript";

/**
 * Finds statically named custom-element registrations in a source file: a tag given as a string
 * literal, or, with a `checker`, as a constant whose type is one (`customElements.define(TAG, El)`).
 */
export function detectCustomElementRegistrations(
  sourceFile: ts.SourceFile,
  checker?: ts.TypeChecker,
): Map<string, string> {
  const registrations = new Map<string, string>();

  ts.forEachChild(sourceFile, function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText() === "customElements" &&
      node.expression.name.text === "define"
    ) {
      const [tagName, className] = node.arguments;
      const tag = tagName && tagNameOf(tagName, checker);
      if (tag && className && ts.isIdentifier(className)) {
        registrations.set(className.text, tag);
      }
    }
    ts.forEachChild(node, visit);
  });

  return registrations;
}

/** The tag of a registration: a string literal, or a constant whose type is a string literal. */
function tagNameOf(expression: ts.Expression, checker?: ts.TypeChecker): string | undefined {
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (!checker) return undefined;
  const type = checker.getTypeAtLocation(expression);
  return type.isStringLiteral() ? type.value : undefined;
}
