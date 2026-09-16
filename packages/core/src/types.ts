import ts from "typescript";
import type { Package as CemPackage } from "custom-elements-manifest/schema";

export type TypeParsingMode = "none" | "public" | "all";

export interface OmitInheritedMap {
  members?: string[];
  attributes?: string[];
  cssProperties?: string[];
  cssParts?: string[];
  cssStates?: string[];
  slots?: string[];
  events?: string[];
}

export interface FileContext {
  filePath: string;
  sourceText: string;
  sourceFile: ts.SourceFile;
  checker: ts.TypeChecker;
  typeParsing: TypeParsingMode;
}

/** One class/element declaration's worth of manifest data. */
export interface ClassFragment {
  name: string;
  module?: string;
  exportName?: string;
  tagName?: string;
  summary?: string;
  deprecated?: boolean | string;
  superclass?: { name: string; module?: string };
  members?: Array<{
    name: string;
    type?: string;
    description?: string;
    summary?: string;
    deprecated?: boolean | string;
    privacy?: "public" | "private" | "protected";
    static?: boolean;
    readonly?: boolean;
    default?: string;
    parsedType?: string;
    parameters?: Array<{
      name: string;
      type?: string;
      parsedType?: string;
      optional?: boolean;
      rest?: boolean;
      default?: string;
    }>;
    return?: { type?: string; parsedType?: string; description?: string; [k: string]: unknown };
    [k: string]: unknown;
  }>;
  attributes?: Array<{
    name: string;
    type?: string;
    parsedType?: string;
    description?: string;
    summary?: string;
    deprecated?: boolean | string;
    [k: string]: unknown;
  }>;
  cssProperties?: Array<{
    name: string;
    description?: string;
    summary?: string;
    default?: string;
    syntax?: string;
    deprecated?: boolean | string;
  }>;
  cssParts?: Array<{
    name: string;
    description?: string;
    summary?: string;
    deprecated?: boolean | string;
  }>;
  cssStates?: Array<{
    name: string;
    description?: string;
    summary?: string;
    deprecated?: boolean | string;
  }>;
  slots?: Array<{
    name: string;
    description?: string;
    summary?: string;
    deprecated?: boolean | string;
  }>;
  events?: Array<{
    name: string;
    description?: string;
    summary?: string;
    deprecated?: boolean | string;
    type?: string;
    parsedType?: string;
    detail?: string;
  }>;
  omitInherited?: OmitInheritedMap;
  [k: string]: unknown;
}

export type ManifestFragment = Record<string /* class name */, ClassFragment>;

export interface InternalManifest {
  schemaVersion: string;
  modules: Array<{
    source?: string;
    path: string;
    typeDefinitionPath?: string;
    declarations: ClassFragment[];
  }>;
}

/** Implement only the lifecycle hooks a plugin needs. */
export interface Plugin {
  name: string;
  /** Cheap, text-level opt-in check — runs before any AST work. */
  shouldAnalyze?(sourceText: string, filePath: string): boolean;
  /** Per-file analysis. Return only the classes this plugin found/enriched. */
  onFile?(context: FileContext): ManifestFragment;
  /**
   * Optional whole-manifest detector hook.
   *
   * Use this for cross-file detection that still belongs to detector logic
   * (for example, registration discovered in a different module).
   * Patch semantics are additive-only, matching annotators.
   */
  afterAllFiles?(manifest: Readonly<InternalManifest>): ManifestPatch;
  /** Runs after detection and inheritance for cross-cutting enrichment. */
  afterManifest?(manifest: Readonly<InternalManifest>): ManifestPatch;
  /** Runs after the internal manifest has been converted and validated as CEM output. */
  afterGenerate?(manifest: CemPackage): void;
}

/** Compatibility type for plugins that implement source detection. */
export type DetectorPlugin = Plugin & { onFile: (context: FileContext) => ManifestFragment };

/** Compatibility type for plugins that implement final-manifest enrichment. */
export type AnnotatorPlugin = Plugin & {
  afterManifest: (manifest: Readonly<InternalManifest>) => ManifestPatch;
};

/**
 * Preferred patch form:
 * - byDeclaration: "<module-path>#<class-name>" -> fields to add
 *
 * Legacy patch form:
 * - Record<class-name, fields>
 *   Kept for compatibility, but ambiguous if the same class name exists in
 *   multiple modules.
 */
export type ManifestPatch =
  | {
      byDeclaration?: Record<string, Partial<ClassFragment>>;
      byClassName?: Record<string, Partial<ClassFragment>>;
      replaceByDeclaration?: Record<string, Partial<ClassFragment>>;
      replaceByClassName?: Record<string, Partial<ClassFragment>>;
    }
  | Record<string, Partial<ClassFragment>>;

export function isDetectorPlugin(p: Plugin): p is DetectorPlugin {
  return typeof p.onFile === "function" || typeof p.afterAllFiles === "function";
}

export function isAnnotatorPlugin(p: Plugin): p is AnnotatorPlugin {
  return "afterManifest" in p;
}
