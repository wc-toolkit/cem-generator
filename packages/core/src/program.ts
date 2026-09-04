import ts from "typescript";
import path from "node:path";

export interface ProgramResult {
  program: ts.Program;
  checker: ts.TypeChecker;
  sourceFiles: ts.SourceFile[];
}

/**
 * Builds a single shared ts.Program over the project, using its own
 * tsconfig.json for module resolution / path mappings / include-exclude.
 * One Program is reused across every plugin's analysis for a run, rather
 * than each plugin (or each file) constructing its own — Program
 * construction is the expensive part of TS-based analysis, not walking
 * individual ASTs.
 */
export function createProgramFromTsConfig(tsConfigPath: string): ProgramResult {
  const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsConfigPath)
  );

  // allowJs + checkJs so JSDoc-typed vanilla components get real type
  // resolution too, not just .ts/.tsx files.
  const options: ts.CompilerOptions = {
    ...parsed.options,
    allowJs: true,
    checkJs: parsed.options.checkJs ?? false,
  };

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options,
  });

  const checker = program.getTypeChecker();
  const sourceFiles = program
    .getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile && !sf.fileName.includes("node_modules"));

  return { program, checker, sourceFiles };
}
