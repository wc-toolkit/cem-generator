import type { DetectorPlugin, FileContext, ManifestFragment } from "./types.js";
import { parseCssElements } from "./css-metadata.js";

/** Detects documented custom elements implemented solely by CSS. */
export function cssBuiltin(): DetectorPlugin {
  return {
    name: "css",
    shouldAnalyze(_sourceText, filePath) {
      return filePath.endsWith(".css");
    },
    onFile(context: FileContext): ManifestFragment {
      return parseCssElements(context.sourceText);
    },
  };
}
