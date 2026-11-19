import * as ts from "typescript/ast";
import { symbolDeclarationPaths, symbolDeclarations } from "@wc-toolkit/cem-generator-utils";
import { SymbolFlags } from "typescript/sync";
import type { Checker, Program, Symbol as TsSymbol } from "typescript/sync";
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
  checker: Checker,
  sourceFiles: ts.SourceFile[],
  options: ManifestValidationOptions = {},
  program?: Program,
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const invariants = options.invariants ?? "error";
  const exportTypes = options.exportTypes ?? "off";

  if (invariants !== "off") {
    checkInvariants(manifest, invariants, failures);
  }
  if (exportTypes !== "off") {
    checkExportedTypes(internal, checker, sourceFiles, exportTypes, failures, program);
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
  checker: Checker,
  sourceFiles: ts.SourceFile[],
  severity: Exclude<ValidationSeverity, "off">,
  failures: ValidationFailure[],
  program?: Program,
) {
  const sourceByPath = new Map<string, ts.SourceFile>(
    sourceFiles.map((sourceFile) => [sourceFile.fileName, sourceFile]),
  );

  for (const module of internal.modules) {
    const sourceFile = sourceByPath.get(module.source ?? "");
    if (!sourceFile) continue;

    for (const declaration of module.declarations) {
      const typeNames = collectReferencedTypeNames(declaration);
      for (const typeName of typeNames) {
        const symbol = checker.resolveName(typeName, SymbolFlags.Type, sourceFile, false);
        if (!symbol || isExportedFromSource(symbol, sourceFile, checker, program)) continue;
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
  symbol: TsSymbol,
  sourceFile: ts.SourceFile,
  checker: Checker,
  program?: Program,
): boolean {
  const resolved = symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  if (isStandardLibrarySymbol(resolved, program)) return true;
  const moduleSymbol = (sourceFile as ts.SourceFile & { symbol?: TsSymbol }).symbol;
  if (
    moduleSymbol &&
    checker
      .getExportsOfModule(moduleSymbol)
      .some((item) => item === resolved || item.name === resolved.name)
  ) {
    return true;
  }
  return (
    symbolDeclarations(resolved).some((declaration) => {
      return (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) !== 0;
    }) ?? false
  );
}

const DECLARATION_FILE_PATH = /\.d\.([^/\\.]+\.)?[cm]?ts$/;

/**
 * Whether a symbol is declared in one of the program's default library files. The program knows
 * which files those are, wherever the compiler keeps them; without a program the check falls back
 * to the layout of the bundled TypeScript package.
 */
function isStandardLibrarySymbol(symbol: TsSymbol, program?: Program): boolean {
  if (!program) return symbolDeclarationPaths(symbol).some(isStandardLibraryPath);
  return symbol.declarations.some(
    (handle) =>
      DECLARATION_FILE_PATH.test(handle.path) &&
      program.getSourceFileMetadataByPath(handle.path)?.isDefaultLibrary === true,
  );
}

function isStandardLibraryPath(filePath: string): boolean {
  return /[^/]*typescript[^/]*\/lib\/lib\.[^/]+\.d\.ts$/i.test(filePath.replace(/\\/g, "/"));
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
