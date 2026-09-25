import ts from "@typescript/typescript6";
import type { Package as CemPackage } from "custom-elements-manifest/schema";
import type { ClassFragment, InternalManifest } from "./types.js";

const TARGET_CEM_SCHEMA_VERSION = "2.1.0";

export type ValidationSeverity = "off" | "warning" | "error";

export interface ManifestValidationOptions {
  /** Validate internal CEM references and generated exports. @default "error" */
  invariants?: ValidationSeverity;
  /** Validate that referenced local types are exported. @default "off" */
  exportTypes?: ValidationSeverity;
  /** Receives warnings. Defaults to console.warn. */
  onWarning?: (message: string) => void;
}

export interface ValidationFailure {
  rule: "manifest.invariants" | "manifest.exportTypes";
  severity: Exclude<ValidationSeverity, "off">;
  message: string;
}

export class ManifestValidationError extends Error {
  readonly failures: ValidationFailure[];

  constructor(failures: ValidationFailure[]) {
    super(`Generated manifest validation failed with ${failures.length} error(s).`);
    this.name = "ManifestValidationError";
    this.failures = failures;
  }
}

export function validateGeneratedManifest(
  manifest: CemPackage,
  internal: InternalManifest,
  checker: ts.TypeChecker,
  sourceFiles: ts.SourceFile[],
  options: ManifestValidationOptions = {},
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const invariants = options.invariants ?? "error";
  const exportTypes = options.exportTypes ?? "off";

  if (invariants !== "off") {
    checkInvariants(manifest, invariants, failures);
  }
  if (exportTypes !== "off") {
    checkExportedTypes(internal, checker, sourceFiles, exportTypes, failures);
  }

  const errors = failures.filter((failure) => failure.severity === "error");
  const warnings = failures.filter((failure) => failure.severity === "warning");
  if (warnings.length) {
    const onWarning = options.onWarning ?? ((message: string) => console.warn(message));
    for (const warning of warnings) onWarning(`${warning.rule}: ${warning.message}`);
  }
  if (errors.length) throw new ManifestValidationError(errors);
  return failures;
}

function checkInvariants(
  manifest: CemPackage,
  severity: Exclude<ValidationSeverity, "off">,
  failures: ValidationFailure[],
) {
  const modules = manifest.modules ?? [];
  const declarations = new Map<string, { name: string; tagName?: string }>();

  if (manifest.schemaVersion !== TARGET_CEM_SCHEMA_VERSION) {
    addFailure(
      failures,
      "manifest.invariants",
      severity,
      `Expected schemaVersion "${TARGET_CEM_SCHEMA_VERSION}" but found "${manifest.schemaVersion}".`,
    );
  }

  for (const module of modules) {
    if (!module.path) {
      addFailure(failures, "manifest.invariants", severity, "A module is missing its path.");
      continue;
    }
    for (const declaration of module.declarations ?? []) {
      const key = `${module.path}#${declaration.name}`;
      declarations.set(key, declaration);
    }
  }

  for (const module of modules) {
    for (const exported of module.exports ?? []) {
      const reference = exported.declaration;
      if (!reference?.name || !reference.module) {
        addFailure(
          failures,
          "manifest.invariants",
          severity,
          `Module "${module.path}" contains an export without a declaration reference.`,
        );
        continue;
      }
      const declaration = declarations.get(`${reference.module}#${reference.name}`);
      if (!declaration) {
        addFailure(
          failures,
          "manifest.invariants",
          severity,
          `Export "${exported.name}" in "${module.path}" references missing declaration "${reference.module}#${reference.name}".`,
        );
        continue;
      }
      if (exported.kind === "custom-element-definition" && declaration.tagName !== exported.name) {
        addFailure(
          failures,
          "manifest.invariants",
          severity,
          `Custom-element export "${exported.name}" does not match declaration tag name for "${reference.name}".`,
        );
      }
    }
  }
}

function checkExportedTypes(
  internal: InternalManifest,
  checker: ts.TypeChecker,
  sourceFiles: ts.SourceFile[],
  severity: Exclude<ValidationSeverity, "off">,
  failures: ValidationFailure[],
) {
  const sourceByPath = new Map(sourceFiles.map((sourceFile) => [sourceFile.fileName, sourceFile]));

  for (const module of internal.modules) {
    const sourceFile = sourceByPath.get(module.source ?? "");
    if (!sourceFile) continue;

    for (const declaration of module.declarations) {
      const typeNames = collectReferencedTypeNames(declaration);
      for (const typeName of typeNames) {
        const symbol = checker.resolveName(typeName, sourceFile, ts.SymbolFlags.Type, false);
        if (!symbol || isExportedFromSource(symbol, sourceFile, checker)) continue;
        addFailure(
          failures,
          "manifest.exportTypes",
          severity,
          `${declaration.name} references local type "${typeName}" that is not exported from "${module.source}".`,
        );
      }
    }
  }
}

function collectReferencedTypeNames(declaration: ClassFragment): string[] {
  const values: unknown[] = [];
  for (const member of declaration.members ?? []) {
    values.push(member.type, member.parsedType, member.return?.type, member.return?.parsedType);
    for (const parameter of member.parameters ?? [])
      values.push(parameter.type, parameter.parsedType);
  }
  for (const attribute of declaration.attributes ?? [])
    values.push(attribute.type, attribute.parsedType);
  for (const event of declaration.events ?? [])
    values.push(event.type, event.parsedType, event.detail);

  const names = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    for (const token of value.matchAll(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g)) {
      const name = token[0];
      if (!NON_EXPORTABLE_TYPES.has(name.toLowerCase())) names.add(name);
    }
  }
  return [...names];
}

function isExportedFromSource(
  symbol: ts.Symbol,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): boolean {
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  if (resolved.declarations?.some((declaration) => isStandardLibraryDeclaration(declaration)))
    return true;
  const moduleSymbol = (sourceFile as ts.SourceFile & { symbol?: ts.Symbol }).symbol;
  if (
    moduleSymbol &&
    checker
      .getExportsOfModule(moduleSymbol)
      .some((item) => item === resolved || item.name === resolved.name)
  ) {
    return true;
  }
  return (
    resolved.declarations?.some((declaration) => {
      return (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) !== 0;
    }) ?? false
  );
}

function isStandardLibraryDeclaration(declaration: ts.Declaration): boolean {
  const fileName = declaration.getSourceFile().fileName.replace(/\\/g, "/");
  return fileName.includes("/typescript/lib/") || fileName.includes("/typescript/lib.");
}

const NON_EXPORTABLE_TYPES = new Set([
  "any",
  "boolean",
  "never",
  "null",
  "number",
  "object",
  "string",
  "symbol",
  "undefined",
  "unknown",
  "void",
  "array",
  "readonlyarray",
  "function",
  "date",
  "regexp",
  "bigint",
  "event",
  "customevent",
  "promise",
  "set",
  "map",
  "weakset",
  "weakmap",
  "readonly",
  "true",
  "false",
]);

function addFailure(
  failures: ValidationFailure[],
  rule: ValidationFailure["rule"],
  severity: Exclude<ValidationSeverity, "off">,
  message: string,
) {
  failures.push({ rule, severity, message });
}
