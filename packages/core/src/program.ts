import ts from "@typescript/typescript6";
import path from "node:path";

export interface ProgramResult {
  program: ts.Program;
  checker: ts.TypeChecker;
  sourceFiles: ts.SourceFile[];
}

export interface CreateProgramOptions {
  tsConfigPath?: string;
}

const DEFAULT_TS_CONFIG_PATH = "./tsconfig.json";

function resolveTsConfigPath(tsConfigPath: string | undefined): string {
  if (tsConfigPath) return tsConfigPath;
  return DEFAULT_TS_CONFIG_PATH;
}

function parseTsConfig(tsConfigPath: string): ts.ParsedCommandLine {
  const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }
  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsConfigPath));
}

function buildCompilerOptions(parsed: ts.ParsedCommandLine): ts.CompilerOptions {
  return {
    ...parsed.options,
    allowJs: true,
    checkJs: parsed.options.checkJs ?? false,
  };
}

function createProgramFromParsed(
  parsed: ts.ParsedCommandLine,
  options: ts.CompilerOptions,
): ts.Program {
  return ts.createProgram({
    rootNames: parsed.fileNames,
    options,
  });
}

function getSourceFiles(program: ts.Program): ts.SourceFile[] {
  return program
    .getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile && !sf.fileName.includes("node_modules"));
}

/**
 * Builds a single shared ts.Program over the project, using its own
 * tsconfig.json for module resolution / path mappings / include-exclude.
 * Defaults to ./tsconfig.json if no path is supplied.
 * One Program is reused across every plugin's analysis for a run, rather
 * than each plugin (or each file) constructing its own — Program
 * construction is the expensive part of TS-based analysis, not walking
 * individual ASTs.
 */
export function createProgramFromTsConfig(tsConfigPath?: string): ProgramResult;
export function createProgramFromTsConfig(options: CreateProgramOptions): ProgramResult;
export function createProgramFromTsConfig(
  tsConfigPathOrOptions: string | CreateProgramOptions = {},
): ProgramResult {
  const options =
    typeof tsConfigPathOrOptions === "string"
      ? { tsConfigPath: tsConfigPathOrOptions }
      : tsConfigPathOrOptions;
  const tsConfigPath = resolveTsConfigPath(options.tsConfigPath);
  const parsed = parseTsConfig(tsConfigPath);
  const compilerOptions = buildCompilerOptions(parsed);
  const program = createProgramFromParsed(parsed, compilerOptions);
  const checker = program.getTypeChecker();
  const sourceFiles = getSourceFiles(program);

  return { program, checker, sourceFiles };
}
