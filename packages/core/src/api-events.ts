import ts from "typescript";
import type { ClassFragment, FileContext } from "./types.js";
import { getNodeTypeText } from "@wc-toolkit/cem-generator-utils";

/** Detects statically named platform events dispatched by a component. */
export function detectClassEvents(node: ts.ClassDeclaration, context: FileContext): ClassFragment["events"] {
  const byName = new Map<string, NonNullable<ClassFragment["events"]>[number]>();

  function visit(current: ts.Node) {
    if (ts.isClassDeclaration(current)) return;

    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === "dispatchEvent"
    ) {
      const event = current.arguments[0];
      if (event && ts.isNewExpression(event) && ts.isIdentifier(event.expression)) {
        const eventName = resolveStaticString(event.arguments?.[0], node.getSourceFile());
        const eventType = resolveEventConstructor(event.expression, node.getSourceFile());
        if (eventName && eventType) {
          const detail = eventType === "CustomEvent" ? getCustomEventDetail(event, context) : undefined;
          byName.set(eventName, {
            name: eventName,
            type: eventType,
            detail,
          });
        }
      }
    }
    ts.forEachChild(current, visit);
  }

  ts.forEachChild(node, visit);
  return byName.size ? [...byName.values()] : undefined;
}

function resolveEventConstructor(expression: ts.Identifier, sourceFile: ts.SourceFile): "Event" | "CustomEvent" | undefined {
  if (expression.text === "Event" || expression.text === "CustomEvent") return expression.text;

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const named = statement.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    const imported = named.elements.find((element) => element.name.text === expression.text);
    const original = imported?.propertyName?.text ?? imported?.name.text;
    if (original === "Event" || original === "CustomEvent") return original;
  }
  return undefined;
}

/** Combines detected events with documented events, letting documentation enrich the result. */
export function mergeClassEvents(
  detected: ClassFragment["events"],
  documented: ClassFragment["events"]
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
  if (!init || !ts.isObjectLiteralExpression(init)) return undefined;
  const detail = init.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && property.name.getText() === "detail"
  );
  return detail ? getNodeTypeText(detail.initializer, context.checker) : undefined;
}

function resolveStaticString(expression: ts.Expression | undefined, sourceFile: ts.SourceFile): string | undefined {
  if (!expression) return undefined;
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (!ts.isIdentifier(expression)) return undefined;
  const identifierName = expression.text;

  let initializer: ts.Expression | undefined;
  function findDeclaration(node: ts.Node) {
    if (initializer) return;
    if (ts.isVariableDeclaration(node) && node.name.getText() === identifierName) {
      initializer = node.initializer;
      return;
    }
    ts.forEachChild(node, findDeclaration);
  }
  findDeclaration(sourceFile);
  if (initializer) return resolveStaticString(initializer, sourceFile);
  return undefined;
}
