import * as ts from "typescript/ast";
import { SymbolFlags } from "typescript/sync";
import * as is from "typescript/ast/is";
import type { Checker } from "typescript/sync";
import type { ClassFragment, FileContext } from "./types.js";
import { getNodeTypeText, symbolDeclarations } from "@wc-toolkit/cem-generator-utils";

/** Detects statically named platform events dispatched by a component. */
export function detectClassEvents(
  node: ts.ClassDeclaration,
  context: FileContext,
): ClassFragment["events"] {
  const byName = new Map<string, NonNullable<ClassFragment["events"]>[number]>();

  function visit(current: ts.Node) {
    if (is.isClassDeclaration(current)) return;

    if (
      is.isCallExpression(current) &&
      is.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === "dispatchEvent"
    ) {
      const event = current.arguments[0];
      if (event && is.isNewExpression(event) && is.isIdentifier(event.expression)) {
        const eventName = resolveStaticString(
          event.arguments?.[0],
          node.getSourceFile(),
          context.checker,
        );
        const eventType = resolveEventConstructor(event.expression, node.getSourceFile());
        if (eventName && eventType) {
          const detail =
            eventType === "CustomEvent" ? getCustomEventDetail(event, context) : undefined;
          byName.set(eventName, {
            name: eventName,
            type: eventType,
            detail,
          });
        }
      }
    }
    current.forEachChild(visit);
  }

  node.forEachChild(visit);
  return byName.size ? [...byName.values()] : undefined;
}

function resolveEventConstructor(
  expression: ts.Identifier,
  sourceFile: ts.SourceFile,
): "Event" | "CustomEvent" | undefined {
  if (expression.text === "Event" || expression.text === "CustomEvent") return expression.text;

  for (const statement of sourceFile.statements) {
    if (!is.isImportDeclaration(statement)) continue;
    const named = statement.importClause?.namedBindings;
    if (!named || !is.isNamedImports(named)) continue;
    const imported = named.elements.find((element) => element.name.text === expression.text);
    const original = imported?.propertyName?.text ?? imported?.name.text;
    if (original === "Event" || original === "CustomEvent") return original;
  }
  return undefined;
}

/** Combines detected events with documented events, letting documentation enrich the result. */
export function mergeClassEvents(
  detected: ClassFragment["events"],
  documented: ClassFragment["events"],
): ClassFragment["events"] {
  const byName = new Map<string, NonNullable<ClassFragment["events"]>[number]>();
  for (const event of detected ?? []) byName.set(event.name, event);
  for (const event of documented ?? []) {
    const merged = { ...byName.get(event.name), ...event };
    for (const [key, value] of Object.entries(merged)) {
      if (value === undefined) delete (merged as Record<string, unknown>)[key];
    }
    byName.set(event.name, merged);
  }
  return byName.size ? [...byName.values()] : undefined;
}

function getCustomEventDetail(event: ts.NewExpression, context: FileContext): string | undefined {
  const init = event.arguments?.[1];
  if (!init || !is.isObjectLiteralExpression(init)) return undefined;
  const detail = init.properties.find(
    (property): property is ts.PropertyAssignment =>
      is.isPropertyAssignment(property) && property.name.getText() === "detail",
  );
  return detail ? getNodeTypeText(detail.initializer, context.checker) : undefined;
}

function resolveStaticString(
  expression: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
  checker: Checker,
  resolving = new Set<string>(),
): string | undefined {
  if (!expression) return undefined;
  if (is.isStringLiteralLikeNode(expression)) return expression.text;
  if (!is.isIdentifier(expression)) return undefined;
  const identifierName = expression.text;
  const resolutionKey = `${sourceFile.fileName}#${identifierName}`;
  if (resolving.has(resolutionKey)) return undefined;
  resolving.add(resolutionKey);

  let initializer: ts.Expression | undefined;
  function findDeclaration(node: ts.Node) {
    if (initializer) return;
    if (is.isVariableDeclaration(node) && node.name.getText() === identifierName) {
      initializer = node.initializer;
      return;
    }
    node.forEachChild(findDeclaration);
  }
  findDeclaration(sourceFile);
  if (initializer) return resolveStaticString(initializer, sourceFile, checker, resolving);

  const symbol = checker.getSymbolAtLocation(expression);
  const resolvedSymbol =
    symbol && symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const declaration = symbolDeclarations(resolvedSymbol, [ts.SyntaxKind.VariableDeclaration]).find(
    is.isVariableDeclaration,
  );
  if (declaration?.initializer) {
    return resolveStaticString(
      declaration.initializer,
      declaration.getSourceFile(),
      checker,
      resolving,
    );
  }
  return undefined;
}
