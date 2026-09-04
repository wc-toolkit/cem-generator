import ts from "typescript";

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
  cssParts?: Array<{ name: string; description?: string; summary?: string; deprecated?: boolean | string }>;
  cssStates?: Array<{ name: string; description?: string; summary?: string; deprecated?: boolean | string }>;
  slots?: Array<{ name: string; description?: string; summary?: string; deprecated?: boolean | string }>;
  events?: Array<{
    name: string;
    description?: string;
    summary?: string;
    deprecated?: boolean | string;
    type?: string;
    parsedType?: string;
  }>;
  omitInherited?: OmitInheritedMap;
  [k: string]: unknown;
}

export type ManifestFragment = Record<string /* class name */, ClassFragment>;

export interface InternalManifest {
  schemaVersion: string;
  modules: Array<{
    path: string;
    declarations: ClassFragment[];
  }>;
}

/**
 * A detector plugin: runs per-file, opt-in via `claims`, returns an isolated
 * fragment. No dependency graph, no shared mutable context — core merges
 * fragments by class name. This is the interface almost every framework
 * plugin (Lit, vanilla, Stencil, ...) implements.
 */
export interface DetectorPlugin {
  name: string;
  /** Cheap, text-level opt-in check — runs before any AST work. */
  claims(sourceText: string, filePath: string): boolean;
  /** Per-file analysis. Return only the classes this plugin found/enriched. */
  onFile(context: FileContext): ManifestFragment;
  /**
   * Optional per-file hook that runs immediately after detector fragment merge
   * for a claimed file. Useful for file-scoped follow-up work.
   */
  afterFile?(context: FileContext, ownFragment: ClassFragment | undefined): ClassFragment | undefined;
  /**
   * Optional whole-manifest detector hook.
   *
   * Use this for cross-file detection that still belongs to detector logic
   * (for example, registration discovered in a different module).
   * Patch semantics are additive-only, matching annotators.
   */
  afterAllFiles?(manifest: Readonly<InternalManifest>): ManifestPatch;
}

/**
 * An annotator plugin: runs once, after the full manifest is assembled.
 * Read-only access to the manifest; returns a patch that may only ADD
 * fields, never overwrite what a detector already wrote. This is how
 * cross-plugin enrichment (e.g. design tokens reading Lit's output) works
 * without a dependency graph between separately-versioned packages.
 */
export interface AnnotatorPlugin {
  name: string;
  afterManifest(manifest: Readonly<InternalManifest>): ManifestPatch;
}

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
    }
  | Record<string, Partial<ClassFragment>>;

export type Plugin = DetectorPlugin | AnnotatorPlugin;

export function isDetectorPlugin(p: Plugin): p is DetectorPlugin {
  return "onFile" in p;
}

export function isAnnotatorPlugin(p: Plugin): p is AnnotatorPlugin {
  return "afterManifest" in p;
}
