import ts from "typescript";
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
      ts.forEachChild(context.sourceFile, function visit(node) {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText() === "customElements" &&
          node.expression.name.text === "define"
        ) {
          const [tagArg, classArg] = node.arguments;
          if (tagArg && ts.isStringLiteralLike(tagArg) && classArg && ts.isIdentifier(classArg)) {
            const existing = tagByClassName.get(classArg.text);
            if (existing && existing !== tagArg.text) {
              throw new Error(
                `Conflicting registrations for class "${classArg.text}": ` +
                  `"${existing}" vs "${tagArg.text}".`
              );
            }
            tagByClassName.set(classArg.text, tagArg.text);
          }
        }
        ts.forEachChild(node, visit);
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
