import * as ts from "typescript/ast";
import {
  getModifiers,
  primaryDeclaration,
  getJSDocInfo,
  getNodeTypeText,
  getParsedTypeText,
  parseCemClassTags,
  getLiteralDefaultText,
  typeAtLocation,
} from "@wc-toolkit/cem-generator-utils";
import * as is from "typescript/ast/is";
import {
  type ClassFragment,
  type DetectorPlugin,
  type FileContext,
  type ManifestFragment,
  discoverFrameworkApis,
} from "@wc-toolkit/cem-generator";

/** Detects custom elements registered with Solid Element's `customElement`. */
export function solidPlugin(): DetectorPlugin {
  return {
    name: "solid",

    shouldAnalyze(sourceText) {
      return (
        /from\s+["']solid-element["']/.test(sourceText) && /\bcustomElement\s*\(/.test(sourceText)
      );
    },

    onFile(context: FileContext): ManifestFragment {
      const fragment: ManifestFragment = {};
      const customElementNames = getCustomElementNames(context.sourceFile);

      context.sourceFile.forEachChild(function visit(node) {
        if (!is.isCallExpression(node) || !isCustomElementCall(node, customElementNames)) {
          node.forEachChild(visit);
          return;
        }

        const tagName = getStringArgument(node.arguments[0]);
        if (!tagName) {
          node.forEachChild(visit);
          return;
        }

        const declaration = findContainingVariable(node);
        const anchor = declaration ?? node.parent;
        const name =
          declaration?.name && is.isIdentifier(declaration.name)
            ? declaration.name.text
            : toDeclarationName(tagName);
        const classDoc = parseCemClassTags(anchor);
        const members = getMembers(node, context);
        const discovered = discoverFrameworkApis(
          node.arguments[2] ?? node,
          context.sourceFile,
          context.checker,
        );
        const attributes = members
          .filter((member) => typeof member.attribute === "string")
          .map((member) => ({
            name: member.attribute as string,
            type: member.type,
            parsedType: member.parsedType,
            description: member.description,
            fieldName: member.name,
          }));

        fragment[name] = {
          name,
          exportName: getExportName(declaration),
          module: context.filePath,
          description: getJSDocInfo(anchor).description || undefined,
          summary: classDoc.summary,
          deprecated: classDoc.deprecated,
          tagName: classDoc.tagName ?? tagName,
          members: members.length ? members : undefined,
          attributes: attributes.length ? attributes : undefined,
          events: mergeNamed(discovered.events, classDoc.events),
          slots: mergeNamed(discovered.slots, classDoc.slots),
          cssParts: mergeNamed(discovered.cssParts, classDoc.cssParts),
          cssProperties: mergeNamed(discovered.cssProperties, classDoc.cssProperties),
          cssStates: classDoc.cssStates,
          omitInherited: classDoc.omitInherited,
          customJsDocTags: classDoc.customJsDocTags,
        } satisfies ClassFragment;

        node.forEachChild(visit);
      });

      return fragment;
    },
  };
}

function mergeNamed<T extends { name: string }>(
  discovered: T[] | undefined,
  documented: T[] | undefined,
): T[] | undefined {
  const values = new Map<string, T>();
  for (const item of discovered ?? []) values.set(item.name, item);
  for (const item of documented ?? []) values.set(item.name, { ...values.get(item.name), ...item });
  return values.size ? [...values.values()] : undefined;
}

function getCustomElementNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !is.isImportDeclaration(statement) ||
      !is.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "solid-element"
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !is.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === "customElement")
        names.add(element.name.text);
    }
  }
  return names;
}

function isCustomElementCall(node: ts.CallExpression, names: Set<string>): boolean {
  return is.isIdentifier(node.expression) && names.has(node.expression.text);
}

function findContainingVariable(node: ts.Node): ts.VariableDeclaration | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current && !is.isSourceFile(current)) {
    if (is.isVariableDeclaration(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function getMembers(
  node: ts.CallExpression,
  context: FileContext,
): NonNullable<ClassFragment["members"]> {
  const byName = new Map<string, NonNullable<ClassFragment["members"]>[number]>();
  const defaults = node.arguments[1];
  if (defaults && is.isObjectLiteralExpression(defaults)) {
    for (const property of defaults.properties) {
      if (!is.isPropertyAssignment(property)) continue;
      const name = getPropertyName(property.name);
      if (!name) continue;
      const attribute = kebabCase(name);
      byName.set(name, {
        name,
        kind: "field",
        type: getExpressionType(property.initializer, context),
        parsedType: getParsedTypeText(property, context.checker) || undefined,
        description: getJSDocInfo(property).description || undefined,
        default: getLiteralDefaultText(property.initializer, context.checker),
        attribute,
      });
    }
  }

  const template = node.arguments[2];
  const parameter =
    template && (is.isArrowFunction(template) || is.isFunctionExpression(template))
      ? template.parameters[0]
      : undefined;
  if (parameter) {
    const type = typeAtLocation(parameter, context.checker);
    for (const property of type.getProperties()) {
      const declaration = primaryDeclaration(property);
      const existing = byName.get(property.name);
      const propertyType = context.checker.getTypeOfSymbolAtLocation(property, parameter);
      byName.set(property.name, {
        ...existing,
        name: property.name,
        kind: "field",
        type: existing?.type ?? context.checker.typeToString(propertyType),
        parsedType:
          existing?.parsedType ??
          (declaration ? getParsedTypeText(declaration, context.checker) || undefined : undefined),
        description:
          existing?.description ??
          (declaration ? getJSDocInfo(declaration).description || undefined : undefined),
        attribute: existing?.attribute ?? (existing ? kebabCase(property.name) : undefined),
      });
    }
  }

  return [...byName.values()];
}

function getExpressionType(node: ts.Expression, context: FileContext): string | undefined {
  if (is.isStringLiteralLikeNode(node)) return "string";
  if (is.isNumericLiteral(node)) return "number";
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword)
    return "boolean";
  if (is.isArrayLiteralExpression(node)) return "array";
  if (is.isObjectLiteralExpression(node)) return "object";
  return getNodeTypeText(node, context.checker);
}

function getStringArgument(argument: ts.Expression | undefined): string | undefined {
  return argument && is.isStringLiteralLikeNode(argument) ? argument.text : undefined;
}

function getPropertyName(name: ts.PropertyName): string | undefined {
  return is.isIdentifier(name) || is.isStringLiteralLikeNode(name) ? name.text : undefined;
}

function kebabCase(name: string): string {
  return name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function toDeclarationName(tagName: string): string {
  return tagName
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

function getExportName(node: ts.VariableDeclaration | undefined): string | undefined {
  const declaration = node?.parent.parent;
  if (!declaration || !is.isVariableStatement(declaration)) return undefined;
  const modifiers = getModifiers(declaration);
  if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
    return undefined;
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ? "default"
    : node?.name.getText();
}
