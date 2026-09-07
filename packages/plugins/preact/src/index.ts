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

/** Detects components registered with preact-custom-element. */
export function preactPlugin(): DetectorPlugin {
  return {
    name: "preact",

    shouldAnalyze(sourceText) {
      return /from\s+["']preact-custom-element["']/.test(sourceText) ||
        /\bregister\s*\(/.test(sourceText);
    },

    onFile(context: FileContext): ManifestFragment {
      const fragment: ManifestFragment = {};
      const registerNames = getRegisterNames(context.sourceFile);

      ts.forEachChild(context.sourceFile, function visit(node) {
        if (ts.isCallExpression(node) && isRegisterCall(node, registerNames)) {
          const component = node.arguments[0];
          const tagName = getStringArgument(node.arguments[1]) ?? getStaticTagName(component, context);
          if (!component || !tagName || !ts.isIdentifier(component)) {
            ts.forEachChild(node, visit);
            return;
          }

          const declaration = resolveComponent(component, context);
          if (!declaration) {
            ts.forEachChild(node, visit);
            return;
          }

          const name = component.text;
          const classDoc = parseCemClassTags(declaration);
          const members = getComponentMembers(declaration, context);
          const discovered = discoverFrameworkApis(declaration, context.sourceFile);
          const observed = getObservedAttributes(node) ?? getStaticObservedAttributes(component, context);
          const attributes = observed?.map((attribute) => {
            const member = members?.find((candidate) => candidate.name === attribute);
            if (member) member.attribute = attribute;
            return {
              name: attribute,
              type: member?.type,
              parsedType: member?.parsedType,
              description: member?.description,
              fieldName: member?.name,
            };
          });

          fragment[name] = {
            name,
            exportName: getExportName(declaration),
            module: context.filePath,
            description: getJSDocInfo(declaration).description || undefined,
            summary: classDoc.summary,
            deprecated: classDoc.deprecated,
            tagName: classDoc.tagName ?? tagName,
            members,
            attributes: attributes?.length ? attributes : undefined,
             slots: mergeNamed(discovered.slots, classDoc.slots),
             events: mergeNamed(discovered.events, classDoc.events),
             cssParts: mergeNamed(discovered.cssParts, classDoc.cssParts),
             cssProperties: mergeNamed(discovered.cssProperties, classDoc.cssProperties),
             cssStates: mergeNamed(discovered.cssStates, classDoc.cssStates),
            omitInherited: classDoc.omitInherited,
            customJsDocTags: classDoc.customJsDocTags,
          } satisfies ClassFragment;
        }
        ts.forEachChild(node, visit);
      });

      return fragment;
    },
  };
}

function mergeNamed<T extends { name: string }>(discovered: T[] | undefined, documented: T[] | undefined): T[] | undefined {
  const values = new Map<string, T>();
  for (const item of discovered ?? []) values.set(item.name, item);
  for (const item of documented ?? []) values.set(item.name, { ...values.get(item.name), ...item });
  return values.size ? [...values.values()] : undefined;
}

function getRegisterNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== "preact-custom-element") continue;
    const clause = statement.importClause;
    if (clause?.name) names.add(clause.name.text);
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) names.add(element.name.text);
    }
  }
  return names;
}

function isRegisterCall(node: ts.CallExpression, names: Set<string>): boolean {
  return ts.isIdentifier(node.expression) && names.has(node.expression.text);
}

function getStringArgument(argument: ts.Expression | undefined): string | undefined {
  return argument && ts.isStringLiteralLike(argument) ? argument.text : undefined;
}

function resolveComponent(identifier: ts.Identifier, context: FileContext): ts.FunctionDeclaration | ts.VariableDeclaration | ts.ClassDeclaration | undefined {
  const symbol = context.checker.getSymbolAtLocation(identifier);
  const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? context.checker.getAliasedSymbol(symbol) : symbol;
  return resolved?.declarations?.find((declaration): declaration is ts.FunctionDeclaration | ts.VariableDeclaration | ts.ClassDeclaration =>
    ts.isFunctionDeclaration(declaration) || ts.isVariableDeclaration(declaration) || ts.isClassDeclaration(declaration)
  );
}

function getComponentMembers(
  declaration: ts.FunctionDeclaration | ts.VariableDeclaration | ts.ClassDeclaration,
  context: FileContext
): ClassFragment["members"] {
  if (ts.isClassDeclaration(declaration)) return undefined;
  const functionNode = ts.isFunctionDeclaration(declaration)
    ? declaration
    : declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
      ? declaration.initializer
      : undefined;
  const parameter = functionNode?.parameters[0];
  if (!parameter) return undefined;

  const type = context.checker.getTypeAtLocation(parameter);
  const members: NonNullable<ClassFragment["members"]> = [];
  for (const property of type.getProperties()) {
    const propertyType = context.checker.getTypeOfSymbolAtLocation(property, parameter);
    members.push({
      name: property.name,
      kind: "field",
      type: context.checker.typeToString(propertyType),
      parsedType: getParsedTypeTextFromSymbol(property, parameter, context),
      description: ts.displayPartsToString(property.getDocumentationComment(context.checker)) || undefined,
    });
  }
  return members.length ? members : undefined;
}

function getParsedTypeTextFromSymbol(symbol: ts.Symbol, location: ts.Node, context: FileContext): string | undefined {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (!declaration) return undefined;
  const type = getParsedTypeText(declaration, context.checker);
  return type || getNodeTypeText(declaration, context.checker);
}

function getObservedAttributes(call: ts.CallExpression): string[] | undefined {
  const argument = call.arguments[2];
  if (!argument || !ts.isArrayLiteralExpression(argument)) return undefined;
  const values = argument.elements.map(getStringArgument).filter((value): value is string => !!value);
  return values.length ? values : undefined;
}

function getStaticTagName(component: ts.Expression, context: FileContext): string | undefined {
  const declaration = ts.isIdentifier(component) ? resolveComponent(component, context) : undefined;
  if (!declaration || !ts.isClassDeclaration(declaration)) return undefined;
  const property = declaration.members.find((member) =>
    ts.isPropertyDeclaration(member) && member.name?.getText() === "tagName"
  );
  if (!property || !ts.isPropertyDeclaration(property)) return undefined;
  const modifiers = ts.canHaveModifiers(property) ? ts.getModifiers(property) : undefined;
  if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword)) return undefined;
  return getStringArgument(property.initializer);
}

function getStaticObservedAttributes(component: ts.Expression, context: FileContext): string[] | undefined {
  const identifier = ts.isIdentifier(component) ? component : undefined;
  const declaration = identifier && resolveComponent(identifier, context);
  if (!declaration || !ts.isClassDeclaration(declaration)) return undefined;
  const property = declaration.members.find((member) =>
    (ts.isPropertyDeclaration(member) || ts.isGetAccessorDeclaration(member)) && member.name?.getText() === "observedAttributes"
  );
  const initializer = property && ts.isPropertyDeclaration(property)
    ? property.initializer
    : property && ts.isGetAccessorDeclaration(property)
      ? property.body?.statements.find(ts.isReturnStatement)?.expression
      : undefined;
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) return undefined;
  return initializer.elements.map(getStringArgument).filter((value): value is string => !!value);
}

function getExportName(node: ts.Declaration): string | undefined {
  if (!ts.isClassDeclaration(node) && !ts.isFunctionDeclaration(node)) return undefined;
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if ((ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) === 0) return undefined;
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? "default" : node.name?.text;
}
