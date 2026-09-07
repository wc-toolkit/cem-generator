import ts from "typescript";
import {
  type ClassFragment,
  type DetectorPlugin,
  type FileContext,
  type ManifestFragment,
  discoverFrameworkApis,
} from "@wc-toolkit/cem-generator";
import {
  getJSDocInfo,
  getNodeTypeText,
  getParsedTypeText,
  parseCemClassTags,
} from "@wc-toolkit/cem-generator-utils";

/** Detects custom elements registered with Solid Element's `customElement`. */
export function solidPlugin(): DetectorPlugin {
  return {
    name: "solid",

    shouldAnalyze(sourceText) {
      return /from\s+["']solid-element["']/.test(sourceText) &&
        /\bcustomElement\s*\(/.test(sourceText);
    },

    onFile(context: FileContext): ManifestFragment {
      const fragment: ManifestFragment = {};
      const customElementNames = getCustomElementNames(context.sourceFile);

      ts.forEachChild(context.sourceFile, function visit(node) {
        if (!ts.isCallExpression(node) || !isCustomElementCall(node, customElementNames)) {
          ts.forEachChild(node, visit);
          return;
        }

        const tagName = getStringArgument(node.arguments[0]);
        if (!tagName) {
          ts.forEachChild(node, visit);
          return;
        }

        const declaration = findContainingVariable(node);
        const anchor = declaration ?? node.parent;
        const name = declaration?.name && ts.isIdentifier(declaration.name)
          ? declaration.name.text
          : toDeclarationName(tagName);
        const classDoc = parseCemClassTags(anchor);
        const members = getMembers(node, context);
        const discovered = discoverFrameworkApis(node.arguments[2] ?? node, context.sourceFile);
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

        ts.forEachChild(node, visit);
      });

      return fragment;
    },
  };
}

function mergeNamed<T extends { name: string }>(
  discovered: T[] | undefined,
  documented: T[] | undefined
): T[] | undefined {
  const values = new Map<string, T>();
  for (const item of discovered ?? []) values.set(item.name, item);
  for (const item of documented ?? []) values.set(item.name, { ...values.get(item.name), ...item });
  return values.size ? [...values.values()] : undefined;
}

function getCustomElementNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== "solid-element") continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === "customElement") names.add(element.name.text);
    }
  }
  return names;
}

function isCustomElementCall(node: ts.CallExpression, names: Set<string>): boolean {
  return ts.isIdentifier(node.expression) && names.has(node.expression.text);
}

function findContainingVariable(node: ts.Node): ts.VariableDeclaration | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isVariableDeclaration(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function getMembers(node: ts.CallExpression, context: FileContext): NonNullable<ClassFragment["members"]> {
  const byName = new Map<string, NonNullable<ClassFragment["members"]>[number]>();
  const defaults = node.arguments[1];
  if (defaults && ts.isObjectLiteralExpression(defaults)) {
    for (const property of defaults.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = getPropertyName(property.name);
      if (!name) continue;
      const attribute = kebabCase(name);
      byName.set(name, {
        name,
        kind: "field",
        type: getExpressionType(property.initializer, context),
        parsedType: getParsedTypeText(property, context.checker) || undefined,
        description: getJSDocInfo(property).description || undefined,
        default: property.initializer.getText(),
        attribute,
      });
    }
  }

  const template = node.arguments[2];
  const parameter = template && (ts.isArrowFunction(template) || ts.isFunctionExpression(template))
    ? template.parameters[0]
    : undefined;
  if (parameter) {
    const type = context.checker.getTypeAtLocation(parameter);
    for (const property of type.getProperties()) {
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      const existing = byName.get(property.name);
      const propertyType = context.checker.getTypeOfSymbolAtLocation(property, parameter);
      byName.set(property.name, {
        ...existing,
        name: property.name,
        kind: "field",
        type: existing?.type ?? context.checker.typeToString(propertyType),
        parsedType: existing?.parsedType ?? (declaration ? getParsedTypeText(declaration, context.checker) || undefined : undefined),
        description: existing?.description ?? (declaration ? getJSDocInfo(declaration).description || undefined : undefined),
        attribute: existing?.attribute ?? (existing ? kebabCase(property.name) : undefined),
      });
    }
  }

  return [...byName.values()];
}

function getExpressionType(node: ts.Expression, context: FileContext): string | undefined {
  if (ts.isStringLiteralLike(node)) return "string";
  if (ts.isNumericLiteral(node)) return "number";
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return "boolean";
  if (ts.isArrayLiteralExpression(node)) return "array";
  if (ts.isObjectLiteralExpression(node)) return "object";
  return getNodeTypeText(node, context.checker);
}

function getStringArgument(argument: ts.Expression | undefined): string | undefined {
  return argument && ts.isStringLiteralLike(argument) ? argument.text : undefined;
}

function getPropertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
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
  if (!declaration || !ts.isVariableStatement(declaration)) return undefined;
  const modifiers = ts.canHaveModifiers(declaration) ? ts.getModifiers(declaration) : undefined;
  if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return undefined;
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? "default" : node?.name.getText();
}
