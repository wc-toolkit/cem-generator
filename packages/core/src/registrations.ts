import * as ts from "typescript/ast";
import { typeAtLocation } from "@wc-toolkit/cem-generator-utils";
import * as is from "typescript/ast/is";
import { isStringLiteralType } from "typescript/sync";
import type { Checker } from "typescript/sync";

/**
 * Finds statically named custom-element registrations in a source file: a tag given as a string
 * literal, or, with a `checker`, as a constant whose type is one (`customElements.define(TAG, El)`).
 */
export function detectCustomElementRegistrations(
  sourceFile: ts.SourceFile,
  checker?: Checker,
): Map<string, string> {
  const registrations = new Map<string, string>();

  sourceFile.forEachChild(function visit(node) {
    if (
      is.isCallExpression(node) &&
      is.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText() === "customElements" &&
      node.expression.name.text === "define"
    ) {
      const [tagName, className] = node.arguments;
      const tag = tagName && tagNameOf(tagName, checker);
      if (tag && className && is.isIdentifier(className)) {
        registrations.set(className.text, tag);
      }
    }
    node.forEachChild(visit);
  });

  return registrations;
}

/** The tag of a registration: a string literal, or a constant whose type is a string literal. */
function tagNameOf(expression: ts.Expression, checker?: Checker): string | undefined {
  if (is.isStringLiteralLikeNode(expression)) return expression.text;
  if (!checker) return undefined;
  const type = typeAtLocation(expression, checker);
  return isStringLiteralType(type) ? type.value : undefined;
}
