import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import * as ts from "typescript/ast";
import { isDecorator } from "typescript/ast/is";
import { API, type Symbol as TsSymbol } from "typescript/sync";

let scopedCompilerPath: string | undefined;

function tsrsCompilerPath(): string | undefined {
  try {
    const require = module.createRequire(import.meta.url);
    const packageJsonPath = require.resolve("tsrs/package.json");
    const tsrsDir = path.dirname(packageJsonPath);
    const exe = process.platform === "win32" ? "tsrs.exe" : "tsrs";
    const candidate = path.join(tsrsDir, "bin", exe);
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    // tsrs is not installed or unsupported on this platform.
  }
  return undefined;
}

/**
 * The compiler server executable to use: the explicit path, then the path of the enclosing
 * `withCompilerPath` run, then `CEM_GENERATOR_COMPILER`, then the `tsrs` binary installed with
 * this package. `undefined` falls back to the server bundled with `typescript`.
 */
export function resolveCompilerPath(explicit?: string): string | undefined {
  const configured = explicit || scopedCompilerPath || process.env.CEM_GENERATOR_COMPILER;
  if (configured) {
    const resolved = path.resolve(configured);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Compiler executable not found: ${resolved}`);
    }
    return resolved;
  }
  return tsrsCompilerPath();
}

/** Creates a compiler API client that spawns the configured compiler server. */
export function createCompilerApi(compilerPath?: string): API {
  const tsserverPath = resolveCompilerPath(compilerPath);
  return tsserverPath ? new API({ tsserverPath }) : new API();
}

/**
 * Runs a synchronous callback with a compiler path that every client created inside it uses,
 * including clients created by helpers that have no access to the run's options.
 */
export function withCompilerPath<T>(compilerPath: string | undefined, run: () => T): T {
  if (!compilerPath) return run();
  const previous = scopedCompilerPath;
  scopedCompilerPath = compilerPath;
  try {
    return run();
  } finally {
    scopedCompilerPath = previous;
  }
}

/** Modifiers (excluding decorators) of a declaration, or undefined when it has none. */
export function getModifiers(node: ts.Node): readonly ts.Modifier[] | undefined {
  const modifiers = (node as { modifiers?: readonly ts.Node[] }).modifiers;
  if (!modifiers) return undefined;
  const filtered = modifiers.filter((modifier): modifier is ts.Modifier => !isDecorator(modifier));
  return filtered.length > 0 ? filtered : undefined;
}

/** Decorators of a declaration, or undefined when it has none. */
export function getDecorators(node: ts.Node): readonly ts.Decorator[] | undefined {
  const modifiers = (node as { modifiers?: readonly ts.Node[] }).modifiers;
  if (!modifiers) return undefined;
  const decorators = modifiers.filter((modifier): modifier is ts.Decorator =>
    isDecorator(modifier),
  );
  return decorators.length > 0 ? decorators : undefined;
}

/**
 * Declarations of a symbol, resolved from the compiler's declaration handles.
 *
 * Resolving a handle fetches the whole source file that contains it from the compiler process
 * (lib.dom.d.ts is ~8 MB), so pass `kinds` whenever only some declarations are of interest: the
 * handle's kind is checked first and non-matching declarations are never fetched.
 */
export function symbolDeclarations(
  symbol: TsSymbol | undefined,
  kinds?: readonly ts.SyntaxKind[],
): ts.Declaration[] {
  if (!symbol) return [];
  const declarations: ts.Declaration[] = [];
  for (const handle of symbol.declarations) {
    if (kinds && !kinds.includes(handle.kind)) continue;
    const declaration = handle.resolve();
    if (declaration) declarations.push(declaration);
  }
  return declarations;
}

/** Whether a symbol has a declaration of one of the given kinds, without fetching anything. */
export function hasDeclarationOfKind(
  symbol: TsSymbol | undefined,
  kinds: readonly ts.SyntaxKind[],
): boolean {
  return !!symbol?.declarations.some((handle) => kinds.includes(handle.kind));
}

/** File paths of a symbol's declarations, without fetching any source file. */
export function symbolDeclarationPaths(symbol: TsSymbol | undefined): string[] {
  return symbol?.declarations.map((handle) => handle.path) ?? [];
}

const DECLARATION_FILE_PATH = /\.d\.([^/\\.]+\.)?[cm]?ts$/;
const LIBRARY_FILE_PATH = /[\\/]lib\.[^/\\]+\.d\.ts$|[\\/]node_modules[\\/]/;

/** Whether a symbol is declared in a TypeScript lib file or a package in node_modules. */
export function hasLibraryDeclaration(symbol: TsSymbol | undefined): boolean {
  return symbolDeclarationPaths(symbol).some(
    (path) => DECLARATION_FILE_PATH.test(path) && LIBRARY_FILE_PATH.test(path),
  );
}

/** The symbol's value declaration, or its first declaration when it has no value declaration. */
export function primaryDeclaration(symbol: TsSymbol | undefined): ts.Declaration | undefined {
  return symbol?.valueDeclaration?.resolve() ?? symbolDeclarations(symbol)[0];
}

export type SnippetParser = (text: string) => ts.SourceFile;

/**
 * Parses small TypeScript snippets (for example, JSDoc wrapped as a declaration) that have no
 * program. One compiler API client is created on first use and closed after the callback.
 */
export function withSnippetParser<T>(run: (parseSnippet: SnippetParser) => T): T {
  let api: API | undefined;
  try {
    return run((text) => {
      api ??= createCompilerApi();
      return api.createSourceFile("snippet.ts", text, { scriptKind: ts.ScriptKind.TS }).sourceFile;
    });
  } finally {
    api?.close();
  }
}
