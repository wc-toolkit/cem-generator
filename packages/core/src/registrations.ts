import ts from "@typescript/typescript6";

/** Finds statically named custom-element registrations in a source file. */
export function detectCustomElementRegistrations(sourceFile: ts.SourceFile): Map<string, string> {
  const registrations = new Map<string, string>();

  ts.forEachChild(sourceFile, function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText() === "customElements" &&
      node.expression.name.text === "define"
    ) {
      const [tagName, className] = node.arguments;
      if (tagName && ts.isStringLiteralLike(tagName) && className && ts.isIdentifier(className)) {
        registrations.set(className.text, tagName.text);
      }
    }
    ts.forEachChild(node, visit);
  });

  return registrations;
}
