import * as ts from "typescript/ast";
import * as is from "typescript/ast/is";
import type { DetectorPlugin, FileContext, ManifestFragment } from "@wc-toolkit/cem-generator";

/**
 * Example detector showing a cross-file pattern:
 * collect `customElements.define()` usage during onFile,
 * then patch declarations in afterAllFiles.
 */
export function defineRegistrationPlugin(): DetectorPlugin {
  const tagByClassName = new Map<string, string>();

  return {
    name: "define-registration-example",

    shouldAnalyze(sourceText) {
      return sourceText.includes("customElements.define") || sourceText.includes("class ");
    },

    onFile(context: FileContext): ManifestFragment {
      context.sourceFile.forEachChild(function visit(node): void {
        if (
          is.isCallExpression(node) &&
          is.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText() === "customElements" &&
          node.expression.name.text === "define"
        ) {
          const [tagArg, classArg] = node.arguments;
          if (
            tagArg &&
            is.isStringLiteralLikeNode(tagArg) &&
            classArg &&
            is.isIdentifier(classArg)
          ) {
            const existing = tagByClassName.get(classArg.text);
            if (existing && existing !== tagArg.text) {
              throw new Error(
                `Conflicting registrations for class "${classArg.text}": ` +
                  `"${existing}" vs "${tagArg.text}".`,
              );
            }
            tagByClassName.set(classArg.text, tagArg.text);
          }
        }
        node.forEachChild(visit);
      });

      return {};
    },

    afterAllFiles(manifest) {
      const byDeclaration: Record<string, { tagName: string }> = {};

      for (const mod of manifest.modules) {
        for (const decl of mod.declarations) {
          if (decl.tagName) continue;
          const tagName = tagByClassName.get(decl.name);
          if (!tagName) continue;
          byDeclaration[`${mod.path}#${decl.name}`] = { tagName };
        }
      }

      tagByClassName.clear();
      return { byDeclaration };
    },
  };
}
