import * as ts from "typescript/ast";
import { isDecorator } from "typescript/ast/is";
import { API, type Symbol as TsSymbol } from "typescript/sync";

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
      api ??= new API();
      return api.createSourceFile("snippet.ts", text, { scriptKind: ts.ScriptKind.TS }).sourceFile;
    });
  } finally {
    api?.close();
  }
}
