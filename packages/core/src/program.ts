import * as ts from "typescript/ast";
import {
  API,
  type Checker,
  type CompilerOptions,
  type ParsedCommandLine,
  type Program,
} from "typescript/sync";
import path from "node:path";

export interface ProgramResult {
  program: Program;
  checker: Checker;
  sourceFiles: ts.SourceFile[];
  dispose(): void;
}

export interface CreateProgramOptions {
  tsConfigPath?: string;
}

const DEFAULT_TS_CONFIG_PATH = "./tsconfig.json";

function resolveTsConfigPath(tsConfigPath: string | undefined): string {
  if (tsConfigPath) return tsConfigPath;
  return DEFAULT_TS_CONFIG_PATH;
}

export function readParsedConfig(api: API, configFilePath: string): ParsedCommandLine | undefined {
  const configFile = api.readConfigFile(configFilePath);
  if (configFile.error) return undefined;
  return api.parseJsonConfigFileContent(configFile.config, {
    configFileName: configFilePath,
  });
}

export function buildCompilerOptions(options: CompilerOptions): CompilerOptions {
  return {
    ...options,
    allowJs: true,
    checkJs: options.checkJs ?? false,
  };
}

export function wrapProgram(program: Program): ProgramResult {
  const checker = program.getProject().checker;
  const sourceFiles = getSourceFiles(program);
  return {
    program,
    checker,
    sourceFiles,
    dispose() {
      program.dispose();
    },
  };
}

const DECLARATION_FILE = /\.d\.([^/\\.]+\.)?[cm]?ts$/;

/**
 * Fetching a source file transfers its whole AST from the compiler process, so declaration
 * files (lib.dom.d.ts alone is ~8 MB) are excluded by name before anything is fetched.
 */
function getSourceFiles(program: Program): ts.SourceFile[] {
  const files: ts.SourceFile[] = [];
  for (const fileName of program.getSourceFileNames()) {
    if (DECLARATION_FILE.test(fileName) || fileName.includes("node_modules")) continue;
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile || sourceFile.isDeclarationFile) continue;
    files.push(sourceFile);
  }
  return files;
}

/**
 * Builds a single shared program over the project, using its own
 * tsconfig.json for module resolution / path mappings / include-exclude.
 * Defaults to ./tsconfig.json if no path is supplied.
 * One Program is reused across every plugin's analysis for a run, rather
 * than each plugin (or each file) constructing its own — Program
 * construction is the expensive part of TS-based analysis, not walking
 * individual ASTs.
 *
 * The returned result owns a compiler API client; call `dispose()` when done.
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
  const tsConfigPath = path.resolve(resolveTsConfigPath(options.tsConfigPath));
  const api = new API();
  try {
    const parsed = readParsedConfig(api, tsConfigPath);
    if (!parsed) {
      throw new Error(`Unable to read tsconfig at ${tsConfigPath}`);
    }
    const program = api.createProgram(parsed.fileNames, buildCompilerOptions(parsed.options));
    const result = wrapProgram(program);
    return {
      ...result,
      dispose() {
        result.dispose();
        api.close();
      },
    };
  } catch (error) {
    api.close();
    throw error;
  }
}
