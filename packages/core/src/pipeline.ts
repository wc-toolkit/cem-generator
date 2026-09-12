import ts from "typescript";
import path from "node:path";
import fs from "node:fs";
import { parseCustomTagValue } from "@wc-toolkit/cem-generator-utils";
import {
  ClassFragment,
  InternalManifest,
  DetectorPlugin,
  AnnotatorPlugin,
  FileContext,
  Plugin,
  isDetectorPlugin,
  isAnnotatorPlugin,
} from "./types.js";
import type { ProgramResult } from "./program.js";
import { vanillaBuiltin } from "./vanilla-builtin.js";
import type {
  Package as CemPackage,
  JavaScriptModule,
  CustomElementDeclaration,
  Attribute,
  JavaScriptExport,
  Event,
  Slot,
  CssCustomProperty,
  CssPart,
  CssCustomState,
  ClassField,
  ClassMethod,
  Parameter,
  Type as CemType,
} from "custom-elements-manifest/schema";
import {
  buildInheritancePatch,
  extractExternalModules,
  type InheritancePluginOptions,
} from "./inheritance-plugin.js";
import {
  validateGeneratedManifest,
  type ManifestValidationOptions,
} from "./validation.js";

export const TARGET_CEM_SCHEMA_VERSION = "2.1.0";

const DEFAULT_TS_CONFIG_PATH = "./tsconfig.json";

export interface CustomTagOptions {
  [tagName: string]: {
    /** Emit the tag's value under a different property name. */
    mappedName?: string;
    /** Always collect the tag's values into an array, even a single one. */
    isArray?: boolean;
  };
}

export interface ModulePathResolverOptions {
  /** Transform the source module path into the published runtime module path. */
  modulePathTemplate?: (modulePath: string, name?: string, tagName?: string) => string;
  /** Add a separate module containing the custom-element definition export. */
  definitionPathTemplate?: (modulePath: string, name?: string, tagName?: string) => string;
  /** Add a non-standard module-level type definition path. */
  typeDefinitionPathTemplate?: (modulePath: string, name?: string, tagName?: string) => string;
  /** Class names excluded from path transformations. */
  exclude?: string[];
  /** Disable module path transformations. */
  skip?: boolean;
}

export interface RunOptions {
  /** Additional plugins beyond the built-in vanilla detector. */
  plugins?: Plugin[];
  /**
   * How to handle conflicting detector values for the same class field.
   *
   * - throw: fail fast on non-equal conflicts
   * - last-wins: let later detector output replace earlier output (default)
   */
  conflictPolicy?: "throw" | "last-wins";
  /** Built-in inheritance materialization; set false to disable. */
  inheritance?: false | InheritancePluginOptions;
  /** Path to tsconfig.json. Defaults to ./tsconfig.json. */
  tsConfigPath?: string;
  /**
   * Glob patterns limiting which program files are analyzed for declarations.
   * If omitted or empty, every non-declaration, non-`node_modules` file in
   * the program is analyzed.
   *
   * Patterns are matched against the absolute file path, the path relative
   * to `process.cwd()`, the path relative to the tsconfig directory, and
   * the basename. Supports `*`, `**`, `?`, `{a,b}`, and `[...]`.
   * A pattern without glob characters acts as an exact-or-directory-prefix
   * match (so `"src/components"` covers everything under that directory).
   */
  include?: string[];
  /**
   * Glob patterns removing files from analysis. Matched the same way as
   * `include`. Exclude wins over include.
   */
  exclude?: string[];
  /**
   * Sort manifest entries alphabetically (modules, declarations, members, attributes, etc.).
   * @default true
   */
  sort?: boolean;
  /**
   * When sorting, move deprecated items to the end of their lists.
   * @default false
   */
  deprecatedLast?: boolean;
  /**
   * Preserve custom JSDoc tags (tags the generator doesn't map to a dedicated
   * manifest field) in the output:
   *
   * - `true` preserves every custom tag automatically.
   * - A map lets you configure per-tag behavior for otherwise-automatic tags:
   *   `mappedName` emits the value under a different property name, and
   *   `isArray` always collects values into an array.
   *
   * Each tag's value is parsed into structured metadata
   * (`{Type} name - description`, `[name=default] - description`, or a bare
   * value) and emitted as a property matching its tag name directly on the
   * class declaration or individual member where it was documented. No
   * `customJsDocTags` array is emitted.
   * @default false
   */
  customJsDocTags?: boolean | CustomTagOptions;
  /** Configure source-to-runtime module path resolution. */
  modulePathResolver?: ModulePathResolverOptions;
  /** Validate the generated manifest before returning it. */
  validation?: ManifestValidationOptions;
}

export function generateCem(options: RunOptions = {}): CemPackage {
const {
    plugins = [],
    conflictPolicy = "last-wins",
    inheritance = {},
    tsConfigPath,
    include,
    exclude,
    sort = true,
    deprecatedLast = true,
    customJsDocTags = false,
    modulePathResolver = {},
    validation,
  } = options;
  const {
    modulePathTemplate,
    definitionPathTemplate,
    typeDefinitionPathTemplate,
    exclude: modulePathExclude = [],
    skip: modulePathSkip = false,
  } = modulePathResolver;

  const customJsDocTagsConfig: CustomTagOptions | undefined =
    typeof customJsDocTags === "object" && customJsDocTags !== null
      ? customJsDocTags
      : customJsDocTags
        ? {}
        : undefined;

  const configFilePath = tsConfigPath ?? DEFAULT_TS_CONFIG_PATH;
  const resolvedPath = path.resolve(configFilePath);
  const programResult = createProgramResult(resolvedPath);
  const { program, checker, sourceFiles } = programResult;
  const projectDir = path.dirname(resolvedPath);
  const runtimeResolver = modulePathSkip
    ? (sourceFile: string) => sourceFile
    : createRuntimeResolver(projectDir, readCompilerOptions(resolvedPath));
  const allPlugins: Plugin[] = [vanillaBuiltin(), ...plugins];
  const additionalFiles = getAdditionalPluginFiles(
    projectDir,
    allPlugins,
    sourceFiles,
    program.getCompilerOptions()
  );
  const filteredFiles = filterSourceFiles([...sourceFiles, ...additionalFiles], include, exclude, projectDir);
  const detectors = allPlugins.filter(isDetectorPlugin);
  const annotators = allPlugins.filter(isAnnotatorPlugin);

  const manifest: InternalManifest = { schemaVersion: TARGET_CEM_SCHEMA_VERSION, modules: [] };

  for (const sourceFile of filteredFiles) {
      const moduleDeclarations = analyzeFile(sourceFile, checker, detectors, conflictPolicy);
    if (moduleDeclarations.length > 0) {
      const pathDeclaration = moduleDeclarations.find(
        (declaration) => declaration.tagName && !modulePathExclude.includes(declaration.name)
      );
      const sourcePath = sourceFile.fileName;
      const resolvedPath = modulePathSkip
        ? sourcePath
        : modulePathTemplate
          ? pathDeclaration
            ? normalizeModulePath(modulePathTemplate(sourcePath, pathDeclaration.name, pathDeclaration.tagName))
            : sourcePath
          : runtimeResolver(sourcePath);
      manifest.modules.push({
        source: sourcePath,
        path: resolvedPath,
        ...(!modulePathSkip && typeDefinitionPathTemplate && pathDeclaration
          ? {
              typeDefinitionPath: normalizeModulePath(
                typeDefinitionPathTemplate(sourcePath, pathDeclaration.name, pathDeclaration.tagName)
              ),
            }
          : {}),
        declarations: moduleDeclarations,
      });
    }
  }

  applyDetectorAfterAllFiles(manifest, detectors);
  applyBuiltInInheritance(manifest, inheritance);
  applyAnnotators(manifest, annotators);

  const cem = toCemPackage(manifest, {
    sort,
    deprecatedLast,
    customJsDocTags: customJsDocTagsConfig,
    definitionPathTemplate: modulePathSkip ? undefined : definitionPathTemplate,
    excludedNames: new Set(modulePathExclude),
  });
  validateGeneratedManifest(cem, manifest, checker, [...sourceFiles, ...additionalFiles], validation);
  for (const plugin of allPlugins) {
    plugin.afterGenerate?.(cem);
  }
  return cem;
}

function getAdditionalPluginFiles(
  projectDir: string,
  plugins: Plugin[],
  existingFiles: ts.SourceFile[],
  compilerOptions: ts.CompilerOptions
): ts.SourceFile[] {
  if (!plugins.some((plugin) => isDetectorPlugin(plugin) && plugin.name === "svelte")) return [];
  const existing = new Set(existingFiles.map((file) => path.resolve(file.fileName)));
  const result: ts.SourceFile[] = [];

  function visit(directory: string) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === ".astro") continue;
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(filePath);
      } else if (entry.isFile() && entry.name.endsWith(".svelte") && !existing.has(path.resolve(filePath))) {
        const sourceText = fs.readFileSync(filePath, "utf-8");
        result.push(ts.createSourceFile(filePath, sourceText, compilerOptions.target ?? ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
      }
    }
  }

  visit(projectDir);
  return result;
}

type ExportTarget = { key: string; types?: string; runtime?: string };

function readCompilerOptions(configFilePath: string): ts.CompilerOptions {
  const configFile = ts.readConfigFile(configFilePath, ts.sys.readFile);
  if (configFile.error) return {};
  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configFilePath)).options;
}

function createRuntimeResolver(projectDir: string, compilerOptions: ts.CompilerOptions): (sourceFile: string) => string {
  const packageRoot = findPackageRoot(projectDir);
  if (!packageRoot) return (sourceFile) => sourceFile;

  const packageJsonPath = path.join(packageRoot, "package.json");
  let packageJson: { exports?: unknown };
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { exports?: unknown };
  } catch {
    return (sourceFile) => sourceFile;
  }

  const targets = readExportTargets(packageJson.exports);
  if (targets.length === 0) return (sourceFile) => sourceFile;
  return (sourceFile) => {
    const relativeSource = toPosixPath(path.relative(packageRoot, sourceFile));
    const runtimeCandidates = outputCandidates(relativeSource, projectDir, packageRoot, compilerOptions);
    const runtimeCandidate = runtimeCandidates.find((candidate) => candidate.endsWith(".js"));
    const declarationCandidate = runtimeCandidate
      ?.replace(/\.js$/, ".d.ts");

    for (const target of targets) {
      const declarationForTypes = target.types?.endsWith("*")
        ? declarationCandidate?.replace(/\.d\.ts$/, "")
        : declarationCandidate;
      const match =
        matchExportTarget(target.types, declarationForTypes) ??
        matchExportTarget(target.runtime, runtimeCandidate);
      if (match !== undefined && target.runtime) {
        const resolved = normalizeModulePath(target.runtime.replace(/^\.\//, "").replace("*", match));
        if (!path.posix.extname(resolved) && target.runtime.endsWith("*") && runtimeCandidate) {
          return `${resolved}${path.posix.extname(runtimeCandidate)}`;
        }
        return resolved;
      }
    }

    return runtimeCandidates.find((candidate) => candidate.endsWith(".js")) ?? sourceFile;
  };
}

function findPackageRoot(startDir: string): string | undefined {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, "package.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function readExportTargets(exportsField: unknown): ExportTarget[] {
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    return [{ key: ".", ...readExportConditionTargets(exportsField) }];
  }
  if (!exportsField || typeof exportsField !== "object") return [];
  const record = exportsField as Record<string, unknown>;
  const entries = Object.keys(record).some((key) => key.startsWith("."))
    ? Object.entries(record)
    : [[".", exportsField] as [string, unknown]];
  const targets: ExportTarget[] = [];

  for (const [key, value] of entries) {
    if (!key.startsWith(".")) continue;
    targets.push({ key, ...readExportConditionTargets(value) });
  }
  return targets.sort((a, b) => {
    const aWildcard = a.key.includes("*");
    const bWildcard = b.key.includes("*");
    if (aWildcard !== bWildcard) return aWildcard ? 1 : -1;
    return b.key.length - a.key.length;
  });
}

function readExportConditionTargets(value: unknown): Omit<ExportTarget, "key"> {
  return {
    types: resolveExportCondition(value, ["types"]),
    runtime: resolveExportCondition(value, ["import", "default", "node", "browser"]),
  };
}

function resolveExportCondition(value: unknown, preferredConditions: string[]): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const resolved = resolveExportCondition(candidate, preferredConditions);
      if (resolved) return resolved;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const condition of [...preferredConditions, ...Object.keys(record)]) {
    if (!(condition in record)) continue;
    const resolved = resolveExportCondition(record[condition], preferredConditions);
    if (resolved) return resolved;
  }
  return undefined;
}

function outputCandidates(
  relativeSource: string,
  projectDir: string,
  packageRoot: string,
  compilerOptions: ts.CompilerOptions
): string[] {
  const sourceWithoutExtension = relativeSource.replace(/\.(tsx?|mts|cts|jsx?|mjs|cjs)$/, "");
  const sourceRoot = compilerOptions.rootDir
    ? path.resolve(projectDir, compilerOptions.rootDir)
    : projectDir;
  const outputRoot = compilerOptions.outDir
    ? path.resolve(projectDir, compilerOptions.outDir)
    : projectDir;
  const sourcePath = path.resolve(packageRoot, relativeSource);
  const sourceRelativeToRoot = toPosixPath(path.relative(sourceRoot, sourcePath));
  const rootRelative = sourceRelativeToRoot.replace(/\.(tsx?|mts|cts|jsx?|mjs|cjs)$/, "");
  const relativeToProject = toPosixPath(path.relative(projectDir, sourcePath));
  const candidates = [
    toPosixPath(path.relative(packageRoot, path.join(outputRoot, `${rootRelative}.js`))),
    toPosixPath(path.relative(packageRoot, path.join(outputRoot, `${rootRelative}.mjs`))),
    toPosixPath(path.relative(packageRoot, path.join(outputRoot, `${rootRelative}.cjs`))),
    `${relativeToProject.replace(/\.(tsx?|mts|cts|jsx?|mjs|cjs)$/, ".js")}`,
  ];
  return [...new Set(candidates)];
}

function matchExportTarget(target: string | undefined, candidate: string | undefined): string | undefined {
  if (!target || !candidate) return undefined;
  const normalizedTarget = target.replace(/^\.\//, "");
  if (!normalizedTarget.includes("*")) return normalizedTarget === candidate ? "" : undefined;
  const [prefix, suffix] = normalizedTarget.split("*");
  if (!candidate.startsWith(prefix) || !candidate.endsWith(suffix)) return undefined;
  return candidate.slice(prefix.length, candidate.length - suffix.length || undefined);
}

function createProgramResult(configFilePath: string): ProgramResult {
  const configFile = ts.readConfigFile(configFilePath, ts.sys.readFile);
  if (configFile.error) {
    const fallback = createDefaultProgram(path.dirname(configFilePath));
    return fallback;
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configFilePath));
  const options: ts.CompilerOptions = { ...parsed.options, allowJs: true, checkJs: parsed.options.checkJs ?? false };
  const program = ts.createProgram({ rootNames: parsed.fileNames, options });
  const checker = program.getTypeChecker();
  const sourceFiles = program.getSourceFiles().filter((sf) => !sf.isDeclarationFile && !sf.fileName.includes("node_modules"));
  return { program, checker, sourceFiles };
}

function createDefaultProgram(projectDir: string): ProgramResult {
  const configPath = path.join(projectDir, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (!configFile.error) {
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectDir);
    const options: ts.CompilerOptions = { ...parsed.options, allowJs: true, checkJs: parsed.options.checkJs ?? false };
    const program = ts.createProgram({ rootNames: parsed.fileNames, options });
    const checker = program.getTypeChecker();
    const sourceFiles = program.getSourceFiles().filter((sf) => !sf.isDeclarationFile && !sf.fileName.includes("node_modules"));
    return { program, checker, sourceFiles };
  }

  const options: ts.CompilerOptions = { allowJs: true, checkJs: false };
  const program = ts.createProgram({ rootNames: [projectDir], options });
  const checker = program.getTypeChecker();
  const sourceFiles = program.getSourceFiles().filter((sf) => !sf.isDeclarationFile && !sf.fileName.includes("node_modules"));
  return { program, checker, sourceFiles };
}

function filterSourceFiles(
  sourceFiles: ts.SourceFile[],
  include: string[] | undefined,
  exclude: string[] | undefined,
  projectDir: string
): ts.SourceFile[] {
  if ((!include || include.length === 0) && (!exclude || exclude.length === 0)) {
    return sourceFiles;
  }
  return sourceFiles.filter((sf) => {
    if (exclude && exclude.length > 0 && matchesAnyPattern(sf.fileName, exclude, projectDir)) {
      return false;
    }
    if (include && include.length > 0) {
      return matchesAnyPattern(sf.fileName, include, projectDir);
    }
    return true;
  });
}

function matchesAnyPattern(fileName: string, patterns: string[], projectDir: string): boolean {
  const candidates = buildMatchCandidates(fileName, projectDir);
  return patterns.some((pattern) => {
    const normalized = normalizeGlobPattern(pattern);
    if (!hasGlobMagic(normalized)) {
      return candidates.some(
        (candidate) => candidate === normalized || candidate.startsWith(`${normalized}/`)
      );
    }
    const re = globToRegExp(normalized);
    return candidates.some((candidate) => re.test(candidate));
  });
}

function buildMatchCandidates(fileName: string, projectDir: string): string[] {
  const abs = toPosixPath(fileName);
  const candidates = [abs];
  const relCwd = toPosixPath(path.relative(process.cwd(), fileName));
  if (!relCwd.startsWith("..")) candidates.push(relCwd);
  const relProject = toPosixPath(path.relative(projectDir, fileName));
  if (!relProject.startsWith("..")) candidates.push(relProject);
  candidates.push(path.posix.basename(abs));
  return candidates;
}

function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function normalizeModulePath(modulePath: string): string {
  const normalized = toPosixPath(modulePath);
  const [protocol, ...segments] = normalized.split("://");
  if (segments.length === 0) return normalized.replace(/\/{2,}/g, "/");
  return `${protocol}://${segments.join("://").replace(/\/{2,}/g, "/")}`;
}

function normalizeGlobPattern(pattern: string): string {
  let normalized = toPosixPath(pattern).replace(/\/+/g, "/");
  if (normalized.startsWith("./")) normalized = normalized.slice(2);
  if (normalized.length > 1 && normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized;
}

function hasGlobMagic(pattern: string): boolean {
  return /[*?[\]{}]/.test(pattern);
}

function globToRegExpSource(glob: string): string {
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        re += "[^/]*";
        i += 1;
      }
    } else if (c === "?") {
      re += "[^/]";
      i += 1;
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) {
        re += "\\{";
        i += 1;
      } else {
        const inner = glob
          .slice(i + 1, end)
          .split(",")
          .map((part) => globToRegExpSource(part))
          .join("|");
        re += `(?:${inner})`;
        i = end + 1;
      }
    } else if (c === "[") {
      const end = glob.indexOf("]", i);
      if (end === -1) {
        re += "\\[";
        i += 1;
      } else {
        re += glob.slice(i, end + 1);
        i = end + 1;
      }
    } else {
      if ("+|^$.()\\".includes(c)) re += `\\${c}`;
      else re += c;
      i += 1;
    }
  }
  return re;
}

function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${globToRegExpSource(glob)}$`);
}

function applyBuiltInInheritance(
  manifest: InternalManifest,
  inheritance: false | InheritancePluginOptions
) {
  if (inheritance === false) return;
  const patch = buildInheritancePatch(manifest, inheritance);
  applyManifestPatch(manifest, "core:inheritance", patch, "Annotator");

  if (inheritance.includeExternalManifests) {
    mergeExternalModulesIntoManifest(manifest, extractExternalModules(inheritance.externalManifests));
  }
}

function mergeExternalModulesIntoManifest(
  manifest: InternalManifest,
  externalModules: InternalManifest["modules"]
) {
  const existingDeclKeys = new Set<string>();
  for (const mod of manifest.modules) {
    for (const decl of mod.declarations) {
      existingDeclKeys.add(`${mod.path}#${decl.name}`);
    }
  }

  for (const extMod of externalModules) {
    const filtered = extMod.declarations.filter((decl) => !existingDeclKeys.has(`${extMod.path}#${decl.name}`));
    if (filtered.length === 0) continue;
    manifest.modules.push({ source: extMod.source, path: extMod.path, declarations: filtered });
    for (const decl of filtered) {
      existingDeclKeys.add(`${extMod.path}#${decl.name}`);
    }
  }
}

function analyzeFile(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  detectors: DetectorPlugin[],
  conflictPolicy: "throw" | "last-wins"
): ClassFragment[] {
  const sourceText = sourceFile.getFullText();
  const context: FileContext = { filePath: sourceFile.fileName, sourceText, sourceFile, checker };
  const claimedByPlugin = new Map<DetectorPlugin, boolean>();

  function claimed(plugin: DetectorPlugin): boolean {
    if (claimedByPlugin.has(plugin)) return claimedByPlugin.get(plugin)!;
    const value = plugin.shouldAnalyze?.(sourceText, sourceFile.fileName) ?? true;
    claimedByPlugin.set(plugin, value);
    return value;
  }

  // merged[className] accumulates fragments from every plugin that analyzes
  // this file.
  const merged: Record<string, ClassFragment> = {};
  const fieldOwners: Record<string, Record<string, string>> = {};

  for (const plugin of detectors) {
    if (!claimed(plugin)) continue;
    if (!plugin.onFile) continue;

    const fragment = plugin.onFile(context);
    for (const [className, classFragment] of Object.entries(fragment)) {
      const target = (merged[className] ??= { name: className });
      const owners = (fieldOwners[className] ??= {});

      mergeClassFragment({
        className,
        target,
        incoming: classFragment,
        pluginName: plugin.name,
        owners,
        conflictPolicy,
      });
    }
  }

  return Object.values(merged);
}

function mergeClassFragment({
  className,
  target,
  incoming,
  pluginName,
  owners,
  conflictPolicy,
}: {
  className: string;
  target: ClassFragment;
  incoming: ClassFragment;
  pluginName: string;
  owners: Record<string, string>;
  conflictPolicy: "throw" | "last-wins";
}) {
  for (const [field, incomingValue] of Object.entries(incoming)) {
    if (field === "name" || incomingValue === undefined) continue;

    const currentValue = (target as Record<string, unknown>)[field];
    const hasCurrentValue = currentValue !== undefined;
    const hasConflict = hasCurrentValue && !deepEqual(currentValue, incomingValue);

    if (hasConflict && conflictPolicy === "throw") {
      const previousPlugin = owners[field] ?? "(unknown)";
      throw new Error(
        `Detector conflict on "${className}.${field}": plugin "${previousPlugin}" and ` +
          `"${pluginName}" produced different values. ` +
          `Set conflictPolicy: "last-wins" to allow overrides.`
      );
    }

    if (!hasCurrentValue || conflictPolicy === "last-wins") {
      (target as Record<string, unknown>)[field] = incomingValue;
      owners[field] = pluginName;
    }
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }

  return true;
}

function applyDetectorAfterAllFiles(manifest: InternalManifest, detectors: DetectorPlugin[]) {
  for (const detector of detectors) {
    if (!detector.afterAllFiles) continue;
    const patch = detector.afterAllFiles(manifest);
    applyManifestPatch(manifest, detector.name, patch, "Detector");
  }
}

function applyAnnotators(manifest: InternalManifest, annotators: AnnotatorPlugin[]) {
  for (const plugin of annotators) {
    const patch = plugin.afterManifest(manifest);
    applyManifestPatch(manifest, plugin.name, patch, "Annotator");
  }
}

function applyManifestPatch(
  manifest: InternalManifest,
  pluginName: string,
  patch: Record<string, Partial<ClassFragment>> | { byDeclaration?: Record<string, Partial<ClassFragment>>; byClassName?: Record<string, Partial<ClassFragment>> },
  pluginKind: "Detector" | "Annotator"
) {
  const declarationByKey = new Map<string, ClassFragment>();
  for (const mod of manifest.modules) {
    for (const decl of mod.declarations) {
      declarationByKey.set(`${mod.path}#${decl.name}`, decl);
    }
  }

  const isStructuredPatch =
    !!patch &&
    typeof patch === "object" &&
    ("byDeclaration" in patch || "byClassName" in patch || "replaceByDeclaration" in patch || "replaceByClassName" in patch);

  const byDeclaration = isStructuredPatch && "byDeclaration" in patch ? patch.byDeclaration ?? {} : {};
  const byClassName =
    isStructuredPatch && "byClassName" in patch
      ? patch.byClassName ?? {}
      : (patch as Record<string, Partial<ClassFragment>>);
  const replaceByDeclaration = isStructuredPatch && "replaceByDeclaration" in patch ? patch.replaceByDeclaration ?? {} : {};
  const replaceByClassName = isStructuredPatch && "replaceByClassName" in patch ? patch.replaceByClassName ?? {} : {};

  for (const [declarationKey, patchForClass] of Object.entries(replaceByDeclaration)) {
    const decl = declarationByKey.get(declarationKey);
    if (!decl || !patchForClass) continue;
    Object.assign(decl, patchForClass);
  }

  for (const mod of manifest.modules) {
    for (const decl of mod.declarations) {
      const patchForClass = replaceByClassName[decl.name];
      if (patchForClass) Object.assign(decl, patchForClass);
    }
  }

  for (const [declarationKey, patchForClass] of Object.entries(byDeclaration)) {
    const decl = declarationByKey.get(declarationKey);
    if (!decl || !patchForClass) continue;
    applyAdditivePatch(pluginKind, pluginName, decl, patchForClass);
  }

  for (const mod of manifest.modules) {
    for (const decl of mod.declarations) {
      const patchForClass = byClassName[decl.name];
      if (!patchForClass) continue;
      applyAdditivePatch(pluginKind, pluginName, decl, patchForClass);
    }
  }
}

function sortManifest(
  modules: JavaScriptModule[],
  deprecatedLast: boolean
): JavaScriptModule[] {
  const sortByName = <T extends { name: string; deprecated?: boolean | string }>(
    items: T[],
    deprecatedLast = false
  ): T[] => {
    const getDeprecated = (item: T): boolean => {
      return "deprecated" in item && !!item.deprecated;
    };

    const sorted = [...items].sort((a, b) => {
      const aDeprecated = deprecatedLast && getDeprecated(a);
      const bDeprecated = deprecatedLast && getDeprecated(b);

      if (aDeprecated && !bDeprecated) return 1;
      if (!aDeprecated && bDeprecated) return -1;
      return a.name.localeCompare(b.name);
    });

    return sorted;
  };

  const sortByPath = <T extends { path: string }>(items: T[]): T[] => {
    return [...items].sort((a, b) => a.path.localeCompare(b.path));
  };

  const sortedModules = sortByPath(modules);

  return sortedModules.map((mod) => {
    const sortedDeclarations = sortByName(mod.declarations ?? [], deprecatedLast);
    const sortedExports = sortByName(mod.exports ?? [], deprecatedLast);

    const sortedMod: JavaScriptModule = { ...mod, declarations: sortedDeclarations, exports: sortedExports };

    if (sortedMod.declarations) {
      sortedMod.declarations = sortedMod.declarations.map((decl) => {
        const sortedDecl = { ...decl } as CustomElementDeclaration;

        if (sortedDecl.members) {
          sortedDecl.members = sortByName(sortedDecl.members, deprecatedLast);
        }
        if (sortedDecl.attributes) {
          sortedDecl.attributes = sortByName(sortedDecl.attributes, deprecatedLast);
        }
        if (sortedDecl.events) {
          sortedDecl.events = sortByName(sortedDecl.events, deprecatedLast);
        }
        if (sortedDecl.slots) {
          sortedDecl.slots = sortByName(sortedDecl.slots, deprecatedLast);
        }
        if (sortedDecl.cssProperties) {
          sortedDecl.cssProperties = sortByName(sortedDecl.cssProperties, deprecatedLast);
        }
        if (sortedDecl.cssParts) {
          sortedDecl.cssParts = sortByName(sortedDecl.cssParts, deprecatedLast);
        }
        if (sortedDecl.cssStates) {
          sortedDecl.cssStates = sortByName(sortedDecl.cssStates, deprecatedLast);
        }

        return sortedDecl;
      });
    }

    return sortedMod;
  });
}

/** Parses a custom tag's raw text into structured metadata for emission. */
function toCustomTagValue(text: string): Record<string, unknown> {
  const parsed = parseCustomTagValue(text);
  const out: Record<string, unknown> = {};
  if (parsed?.name !== undefined) out.name = parsed.name;
  if (parsed?.description !== undefined) out.description = parsed.description;
  if (parsed?.default !== undefined) out.default = parsed.default;
  if (parsed?.type !== undefined) out.type = { text: parsed.type };
  return out;
}

/**
 * Groups custom tags by their output property name (honoring `mappedName`),
 * collecting repeated tags into an array (honoring `isArray` and repeat
 * occurrences). Keys that collide with fields already present in `existing`
 * are skipped.
 */
function toCustomTagFields(
  customJsDocTags: Array<{ name: string; text: string }> | undefined,
  config: CustomTagOptions,
  existing?: object
): Record<string, unknown> {
  const grouped = new Map<string, unknown>();

  for (const tag of customJsDocTags ?? []) {
    const option = config[tag.name];
    const key = option?.mappedName ?? tag.name;
    if (!key) continue;
    if (existing && Object.prototype.hasOwnProperty.call(existing, key)) continue;

    const value = toCustomTagValue(tag.text);
    const current = grouped.get(key);
    if (current === undefined) {
      grouped.set(key, option?.isArray ? [value] : value);
    } else {
      grouped.set(key, [...(Array.isArray(current) ? current : [current]), value]);
    }
  }

  return Object.fromEntries(grouped);
}

function toCemPackage(
  internal: InternalManifest,
  options: {
    sort: boolean;
    deprecatedLast: boolean;
    customJsDocTags?: CustomTagOptions;
    definitionPathTemplate?: (modulePath: string, name?: string, tagName?: string) => string;
    excludedNames?: Set<string>;
  } = {
    sort: false,
    deprecatedLast: false,
  }
): CemPackage {
  let modules: JavaScriptModule[] = internal.modules.map((mod) => {
    const declarations: CustomElementDeclaration[] = mod.declarations.map((decl) =>
      toCustomElementDeclaration(decl, options.customJsDocTags)
    );
    const jsExports: JavaScriptExport[] = mod.declarations
      .filter((decl) => !!asString(decl.exportName))
      .map((decl) => ({
        kind: "js",
        name: asString(decl.exportName)!,
        declaration: { name: decl.name, module: mod.path },
      }));

    const module = {
      kind: "javascript-module",
      ...(mod.source ? { source: mod.source } : {}),
      ...(mod.typeDefinitionPath ? { typeDefinitionPath: mod.typeDefinitionPath } : {}),
      path: mod.path,
      declarations,
      exports: [
        ...jsExports,
        ...declarations
          .filter((decl) => !!decl.tagName)
          .map((decl) => ({
            kind: "custom-element-definition" as const,
            name: decl.tagName!,
            declaration: { name: decl.name, module: mod.path },
          })),
      ],
    } as unknown as JavaScriptModule;

    return module;
  });

  rewriteKnownModuleReferences(modules, internal);

  if (options.definitionPathTemplate) {
    const definitionModules: JavaScriptModule[] = [];
    for (const mod of internal.modules) {
      for (const declaration of mod.declarations.filter(
        (item) => item.tagName && !options.excludedNames?.has(item.name)
      )) {
        const definitionPath = normalizeModulePath(
          options.definitionPathTemplate(mod.source ?? mod.path, declaration.name, declaration.tagName)
        );
        definitionModules.push({
          kind: "javascript-module",
          path: definitionPath,
          declarations: [],
          exports: [
            {
              kind: "custom-element-definition",
              name: declaration.tagName!,
              declaration: { name: declaration.name, module: mod.path },
            },
          ],
        });
      }
    }
    modules = [...modules, ...definitionModules];
  }

  if (options.sort) {
    modules = sortManifest(modules, options.deprecatedLast);
  }

  return {
    schemaVersion: TARGET_CEM_SCHEMA_VERSION,
    modules,
  } as CemPackage;
}

function rewriteKnownModuleReferences(
  modules: JavaScriptModule[],
  internal: InternalManifest
): void {
  const paths = new Map<string, string>();
  for (const module of internal.modules) {
    if (!module.source) continue;
    paths.set(module.source, module.path);
    paths.set(toPosixPath(module.source), module.path);
  }

  for (const module of modules) {
    rewriteModuleReferences(module.declarations, paths);
    rewriteModuleReferences(module.exports, paths);
  }
}

function rewriteModuleReferences(value: unknown, paths: Map<string, string>): void {
  if (Array.isArray(value)) {
    for (const item of value) rewriteModuleReferences(item, paths);
    return;
  }
  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (typeof record.module === "string") {
    const resolved = paths.get(record.module) ?? paths.get(toPosixPath(record.module));
    if (resolved) record.module = resolved;
  }
  for (const nested of Object.values(record)) rewriteModuleReferences(nested, paths);
}

function toCustomElementDeclaration(
  fragment: ClassFragment,
  customJsDocTagsConfig?: CustomTagOptions
): CustomElementDeclaration {
  const known = {
    kind: asString(fragment.kind) ?? "class",
    customElement: typeof fragment.customElement === "boolean" ? fragment.customElement : true,
    name: fragment.name,
    description: asString(fragment.description),
    summary: asString(fragment.summary),
    deprecated: asDeprecated(fragment.deprecated),
    tagName: asString(fragment.tagName),
    superclass: fragment.superclass
      ? {
          name: fragment.superclass.name,
          module: asString(fragment.superclass.module),
        }
      : undefined,
    members: toMembers(fragment, customJsDocTagsConfig),
    attributes: toAttributes(fragment.attributes),
    events: toEvents(fragment.events),
    slots: toSlots(fragment.slots),
    cssProperties: toCssProperties(fragment.cssProperties),
    cssParts: toCssParts(fragment.cssParts),
    cssStates: toCssStates(fragment.cssStates),
    ...(Array.isArray(fragment.parameters) ? { parameters: fragment.parameters } : {}),
  };

  const extraFields = Object.fromEntries(
    Object.entries(fragment).filter(
      ([key]) =>
        ![
          "name",
          "kind",
          "customElement",
          "module",
          "exportName",
          "tagName",
          "summary",
          "deprecated",
          "superclass",
          "members",
          "attributes",
          "cssProperties",
          "cssParts",
          "cssStates",
          "slots",
          "events",
          "parameters",
          "description",
          "customJsDocTags",
          "omitInherited",
        ].includes(key)
    )
  );

  const customTagFields = customJsDocTagsConfig
    ? toCustomTagFields(
        (fragment as { customJsDocTags?: Array<{ name: string; text: string }> }).customJsDocTags,
        customJsDocTagsConfig,
        { ...(known as Record<string, unknown>), ...extraFields }
      )
    : {};

  return {
    ...(known as Record<string, unknown>),
    ...extraFields,
    ...customTagFields,
  } as unknown as CustomElementDeclaration;
}

function toMembers(
  fragment: ClassFragment,
  customJsDocTagsConfig?: CustomTagOptions
): Array<ClassField | ClassMethod> | undefined {
  if (!fragment.members?.length) return undefined;
  const converted = fragment.members
    .map((member) => {
      const kind = asString(member.kind) === "method" ? "method" : "field";
      if (kind === "method") {
        const method = {
          kind: "method",
          name: member.name,
          description: asString(member.description),
          summary: asString(member.summary),
          deprecated: asDeprecated(member.deprecated),
          privacy: asPrivacy(member.privacy),
          static: asBoolean(member.static),
          parameters: toParameters(member.parameters),
           return: toMethodReturn(member.return),
           ...(member as Record<string, unknown>).inheritedFrom
             ? { inheritedFrom: (member as Record<string, unknown>).inheritedFrom }
             : {},
          ...(toType((member as Record<string, unknown>).parsedType)
            ? {
                "parsedType": toType((member as Record<string, unknown>).parsedType),
              }
            : {}),
        } as unknown as ClassMethod;
        if (customJsDocTagsConfig) {
          Object.assign(
            method as unknown as Record<string, unknown>,
            toCustomTagFields(
              member.customJsDocTags as Array<{ name: string; text: string }> | undefined,
              customJsDocTagsConfig,
              method
            )
          );
        }
        return method;
      }

        const field = {
          kind: "field",
          name: member.name,
        description: asString(member.description),
        summary: asString(member.summary),
        deprecated: asDeprecated(member.deprecated),
        privacy: asPrivacy(member.privacy),
        static: asBoolean(member.static),
          readonly: asBoolean(member.readonly),
          default: asString(member.default),
          attribute: asString((member as Record<string, unknown>).attribute),
          reflects: asBoolean((member as Record<string, unknown>).reflects),
           internal: asBoolean((member as Record<string, unknown>).internal),
           ...(member as Record<string, unknown>).inheritedFrom
             ? { inheritedFrom: (member as Record<string, unknown>).inheritedFrom }
             : {},
          type: toType(member.type),
        ...(toType((member as Record<string, unknown>).parsedType)
          ? {
              "parsedType": toType((member as Record<string, unknown>).parsedType),
            }
          : {}),
      } as unknown as ClassField;
      if (customJsDocTagsConfig) {
        Object.assign(
          field as unknown as Record<string, unknown>,
          toCustomTagFields(
            member.customJsDocTags as Array<{ name: string; text: string }> | undefined,
            customJsDocTagsConfig,
            field
          )
        );
      }
      return field;
    })
    .filter(Boolean);

  return converted.length ? converted : undefined;
}

function toAttributes(
  attributes: ClassFragment["attributes"]
): Attribute[] | undefined {
  if (!attributes?.length) return undefined;
  const converted = attributes
    .map((attr) => ({
      name: attr.name,
      description: asString(attr.description),
      summary: asString(attr.summary),
      deprecated: asDeprecated(attr.deprecated),
      type: toType(attr.type),
      ...(toType((attr as Record<string, unknown>).parsedType)
        ? {
            "parsedType": toType((attr as Record<string, unknown>).parsedType),
          }
        : {}),
      default: asString((attr as Record<string, unknown>).default),
      fieldName: asString((attr as Record<string, unknown>).fieldName),
    }))
    .filter((attr) => !!attr.name);

  return converted.length ? converted : undefined;
}

function toEvents(events: ClassFragment["events"]): Event[] | undefined {
  if (!events?.length) return undefined;
  const converted = events
    .map((event) => ({
      name: event.name,
      description: asString(event.description),
      summary: asString(event.summary),
      deprecated: asDeprecated(event.deprecated),
      type: toType(event.type) ?? { text: "Event" },
      ...(toType((event as Record<string, unknown>).detail)
        ? {
            detail: toType((event as Record<string, unknown>).detail),
          }
        : {}),
      ...(toType((event as Record<string, unknown>).parsedType)
        ? {
            "parsedType": toType((event as Record<string, unknown>).parsedType),
          }
        : {}),
    }))
    .filter((event) => !!event.name);

  return converted.length ? converted : undefined;
}

function toSlots(slots: ClassFragment["slots"]): Slot[] | undefined {
  if (!slots?.length) return undefined;
  const converted = slots.map((slot) => ({
    name: slot.name,
    description: asString(slot.description),
    summary: asString(slot.summary),
    deprecated: asDeprecated(slot.deprecated),
  }));
  return converted.length ? converted : undefined;
}

function toCssProperties(
  cssProperties: ClassFragment["cssProperties"]
): CssCustomProperty[] | undefined {
  if (!cssProperties?.length) return undefined;
  const converted = cssProperties.map((prop) => ({
    name: prop.name,
    description: asString(prop.description),
    summary: asString(prop.summary),
    deprecated: asDeprecated(prop.deprecated),
    default: asString(prop.default),
    syntax: asString(prop.syntax),
  }));
  return converted.length ? converted : undefined;
}

function toCssParts(cssParts: ClassFragment["cssParts"]): CssPart[] | undefined {
  if (!cssParts?.length) return undefined;
  const converted = cssParts.map((part) => ({
    name: part.name,
    description: asString(part.description),
    summary: asString(part.summary),
    deprecated: asDeprecated(part.deprecated),
  }));
  return converted.length ? converted : undefined;
}

function toCssStates(cssStates: ClassFragment["cssStates"]): CssCustomState[] | undefined {
  if (!cssStates?.length) return undefined;
  const converted = cssStates.map((state) => ({
    name: state.name,
    description: asString(state.description),
    summary: asString(state.summary),
    deprecated: asDeprecated(state.deprecated),
  }));
  return converted.length ? converted : undefined;
}

function toType(value: unknown): CemType | undefined {
  const text = asString(value);
  return text ? { text } : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asDeprecated(value: unknown): boolean | string | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function asPrivacy(value: unknown): "public" | "private" | "protected" | undefined {
  return value === "public" || value === "private" || value === "protected" ? value : undefined;
}

function toParameters(params: unknown): Parameter[] | undefined {
  if (!Array.isArray(params) || params.length === 0) return undefined;
  const converted: Parameter[] = [];
  for (const p of params) {
    const rec = p as Record<string, unknown>;
    const name = asString(rec.name);
    if (!name) continue;
    converted.push({
      name,
      type: toType(rec.type),
      ...(toType(rec.parsedType)
        ? {
            "parsedType": toType(rec.parsedType),
          }
        : {}),
      optional: asBoolean(rec.optional),
      rest: asBoolean(rec.rest),
      default: asString(rec.default),
    });
  }
  return converted.length ? converted : undefined;
}

function toMethodReturn(value: unknown): { type?: CemType; description?: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Record<string, unknown>;
  const type = toType(rec.type);
  const description = asString(rec.description);
  const parsedType = toType(rec.parsedType);
  if (!type && !description && !parsedType) return undefined;
  return {
    type,
    ...(parsedType ? { "parsedType": parsedType } : {}),
    description,
  };
}

function applyAdditivePatch(
  pluginKind: "Detector" | "Annotator",
  pluginName: string,
  decl: ClassFragment,
  patchForClass: Partial<ClassFragment>
) {
  for (const [field, value] of Object.entries(patchForClass)) {
    if (field in decl) {
      throw new Error(
        `${pluginKind} plugin "${pluginName}" attempted to overwrite existing field ` +
          `"${field}" on "${decl.name}". Patches may only add new fields.`
      );
    }
    (decl as Record<string, unknown>)[field] = value;
  }
}
