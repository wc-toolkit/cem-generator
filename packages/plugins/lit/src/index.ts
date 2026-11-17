import * as ts from "typescript/ast";
import {
  symbolDeclarations,
  getModifiers,
  getDecorators,
  getJSDocInfo,
  getNodeTypeText,
  getParsedTypeText,
  inheritsFrom,
  resolveMeaningfulParsedTypeFromText,
  parseCemClassTags,
  parseCemMemberTags,
  areTypeTextsEquivalent,
  getLiteralDefaultText,
} from "@wc-toolkit/cem-generator-utils";
import { SymbolFlags } from "typescript/sync";
import * as is from "typescript/ast/is";
import type { Checker } from "typescript/sync";
import {
  detectClassMembers,
  type DetectorPlugin,
  type FileContext,
  type ManifestFragment,
  type ClassFragment,
  mergeClassEvents,
  detectClassEvents,
  detectCustomElementRegistrations,
  discoverFrameworkApis,
  parseCssMetadata,
} from "@wc-toolkit/cem-generator";

const decoratorNameCache = new WeakMap<ts.SourceFile, Map<string, string | undefined>>();

export function litPlugin(): DetectorPlugin {
  const registeredTags = new Map<string, string>();
  const mixinResults = new WeakMap<ts.Declaration, LitMixin | undefined>();
  const baseMemberResults = new WeakMap<ts.ClassDeclaration, ClassFragment["members"]>();

  return {
    name: "lit",

    shouldAnalyze(sourceText) {
      return (
        /from\s+['"]lit['"]/.test(sourceText) ||
        /extends\s+[A-Za-z_$][\w$]*/.test(sourceText) ||
        /customElements\.define\s*\(/.test(sourceText)
      );
    },

    onFile(context: FileContext): ManifestFragment {
      const fragment: ManifestFragment = {};
      const mixins = new Map<string, LitMixin>();
      const registrations = detectCustomElementRegistrations(context.sourceFile);
      for (const [className, tagName] of registrations) registeredTags.set(className, tagName);

      context.sourceFile.forEachChild(function visit(node) {
        if (is.isClassDeclaration(node) && node.name && extendsLitElement(node, context.checker)) {
          const className = node.name.text;
          const jsdoc = getJSDocInfo(node);
          const classDoc = parseCemClassTags(node);
          const discoveredApis = discoverFrameworkApis(node, context.sourceFile, context.checker);
          const mixinNames = getLitMixinNames(node);
          for (const name of mixinNames)
            resolveLitMixin(name, node, context, mixins, new Set(), mixinResults);
          addMixinFragments(fragment, mixins);
          const ownMembers = mergeLitMembers(
            filterLitMembers(detectClassMembers(node, context)),
            getDecoratedProperties(node, context),
            getStaticPropertyMetadata(node),
          );
          const baseMembers = getLitBaseClassMembers(
            node,
            context,
            mixins,
            baseMemberResults,
            mixinResults,
          );
          const members = mergeLitMembers(
            ...mixinNames.flatMap((name) => {
              const mixin = mixins.get(name);
              return mixin ? [mixin.members] : [];
            }),
            baseMembers,
            ownMembers,
            undefined,
          );

          fragment[className] = {
            name: className,
            exportName: getExportName(node),
            module: context.filePath,
            description: jsdoc.description || undefined,
            summary: classDoc.summary,
            deprecated: classDoc.deprecated,
            tagName:
              classDoc.tagName ?? getCustomElementTagName(node) ?? registrations.get(className),
            superclass: getLitSuperclass(node, context.checker),
            ...(mixinNames.length
              ? {
                  mixins: mixinNames.map((name) => ({
                    name,
                    module: context.filePath,
                  })),
                }
              : {}),
            members,
            slots: mergeSlots(discoveredApis.slots, classDoc.slots),
            events: mergeClassEvents(
              detectClassEvents(node, context),
              classDoc.events?.map((event) => ({
                ...event,
                parsedType:
                  context.typeParsing === "none"
                    ? undefined
                    : resolveMeaningfulParsedTypeFromText(
                        event.type,
                        context.sourceFile,
                        context.checker,
                      ),
              })),
            ),
            cssParts: mergeCssParts(discoveredApis.cssParts, classDoc.cssParts),
            cssStates: classDoc.cssStates,
            cssProperties: mergeCssProperties(
              extractCssCustomProps(node, context.checker),
              classDoc.cssProperties,
            ),
            omitInherited: classDoc.omitInherited,
            attributes: classDoc.attributes,
            customJsDocTags: classDoc.customJsDocTags,
          };

          for (const attr of fragment[className].attributes ?? []) {
            attr.parsedType =
              context.typeParsing === "none"
                ? undefined
                : resolveMeaningfulParsedTypeFromText(
                    attr.type,
                    context.sourceFile,
                    context.checker,
                  );
          }

          applyMemberToAttributeLinks(fragment[className], classDoc);
        }
        node.forEachChild(visit);
      });

      return fragment;
    },

    afterAllFiles(manifest) {
      const byDeclaration: Record<string, { tagName: string }> = {};
      for (const module of manifest.modules) {
        for (const declaration of module.declarations) {
          const tagName = registeredTags.get(declaration.name);
          if (!tagName || declaration.tagName) continue;
          byDeclaration[`${module.path}#${declaration.name}`] = { tagName };
        }
      }
      return { byDeclaration };
    },
  };
}

function getExportName(node: ts.ClassDeclaration): string | undefined {
  const modifiers = getModifiers(node);
  if (!modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return undefined;
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) return "default";
  return node.name?.text;
}

type LitMixin = { members: ClassFragment["members"]; exportName?: string };

function addMixinFragments(fragment: ManifestFragment, mixins: Map<string, LitMixin>): void {
  for (const [name, mixin] of mixins) {
    if (fragment[name]) continue;
    fragment[name] = {
      name,
      kind: "mixin",
      customElement: false,
      exportName: mixin.exportName,
      members: mixin.members?.map(({ inheritedFrom: _inheritedFrom, ...member }) => member),
      parameters: [{ name: "superClass" }],
    };
  }
}

function resolveLitMixin(
  name: string,
  anchor: ts.ClassLikeDeclaration,
  context: FileContext,
  mixins: Map<string, LitMixin>,
  resolving: Set<string>,
  mixinResults: WeakMap<ts.Declaration, LitMixin | undefined>,
): LitMixin | undefined {
  const existing = mixins.get(name);
  if (existing) return existing;
  if (resolving.has(name)) return undefined;
  resolving.add(name);

  const identifier = findMixinIdentifier(anchor, name);
  const symbol = identifier ? context.checker.getSymbolAtLocation(identifier) : undefined;
  const resolvedSymbol =
    symbol && symbol.flags & SymbolFlags.Alias ? context.checker.getAliasedSymbol(symbol) : symbol;
  const declaration = symbolDeclarations(resolvedSymbol, [
    ts.SyntaxKind.FunctionDeclaration,
    ts.SyntaxKind.VariableDeclaration,
  ]).find(
    (candidate) => is.isFunctionDeclaration(candidate) || is.isVariableDeclaration(candidate),
  );
  if (declaration && mixinResults.has(declaration)) {
    const cached = mixinResults.get(declaration);
    if (cached) mixins.set(name, cached);
    resolving.delete(name);
    return cached;
  }
  const implementation = declaration ? findMixinImplementation(declaration) : undefined;
  if (!declaration || !implementation) {
    if (declaration) mixinResults.set(declaration, undefined);
    resolving.delete(name);
    return undefined;
  }

  const sourceFile = implementation.getSourceFile();
  const mixinContext: FileContext = {
    filePath: sourceFile.fileName,
    sourceText: sourceFile.getFullText(),
    sourceFile,
    checker: context.checker,
    typeParsing: context.typeParsing,
  };
  const nestedNames = getLitMixinNames(implementation);
  const nestedMembers = nestedNames.flatMap((nestedName) => {
    const nested = resolveLitMixin(
      nestedName,
      implementation,
      mixinContext,
      mixins,
      resolving,
      mixinResults,
    );
    return nested?.members ? [nested.members] : [];
  });
  const ownMembers = mergeLitMembers(
    filterLitMembers(detectClassMembers(implementation, mixinContext)),
    getDecoratedProperties(implementation, mixinContext),
    getStaticPropertyMetadata(implementation),
  );
  const members = mergeLitMembers(...nestedMembers, ownMembers)?.map((member) => ({
    ...member,
    inheritedFrom: member.inheritedFrom ?? {
      name,
      module: sourceFile.fileName,
    },
  }));
  if (!members?.length) {
    mixinResults.set(declaration, undefined);
    resolving.delete(name);
    return undefined;
  }

  const declarationModifiers =
    getModifiers(declaration) !== undefined ? getModifiers(declaration) : undefined;
  const result: LitMixin = {
    members,
    exportName: declarationModifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
      ? name
      : undefined,
  };
  mixins.set(name, result);
  mixinResults.set(declaration, result);
  resolving.delete(name);
  return result;
}

function findMixinIdentifier(
  node: ts.ClassLikeDeclaration,
  name: string,
): ts.Identifier | undefined {
  const heritage = node.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
  );
  let result: ts.Identifier | undefined;
  function visit(expression: ts.Expression) {
    if (result) return;
    if (is.isCallExpression(expression)) {
      if (is.isIdentifier(expression.expression) && expression.expression.text === name) {
        result = expression.expression;
        return;
      }
      for (const argument of expression.arguments) {
        if (is.isExpression(argument)) visit(argument);
      }
    }
  }
  const expression = (heritage?.types[0] as ts.ExpressionWithTypeArguments)?.expression;
  if (expression) visit(expression);
  return result;
}

function findMixinImplementation(
  declaration: ts.FunctionDeclaration | ts.VariableDeclaration,
): ts.ClassDeclaration | ts.ClassExpression | undefined {
  const callable = is.isFunctionDeclaration(declaration)
    ? declaration
    : declaration.initializer &&
        (is.isArrowFunction(declaration.initializer) ||
          is.isFunctionExpression(declaration.initializer))
      ? declaration.initializer
      : undefined;
  if (!callable || callable.parameters.length === 0) return undefined;
  const parameterName = callable.parameters[0].name.getText();
  let implementation: ts.ClassDeclaration | ts.ClassExpression | undefined;
  function visit(node: ts.Node) {
    if (implementation) return;
    if (is.isClassDeclaration(node) || is.isClassExpression(node)) {
      const heritage = node.heritageClauses?.find(
        (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
      );
      if (
        heritage?.types[0] &&
        expressionContainsIdentifier(
          (heritage.types[0] as ts.ExpressionWithTypeArguments).expression,
          parameterName,
        )
      ) {
        implementation = node;
        return;
      }
    }
    node.forEachChild(visit);
  }
  if (callable.body) callable.body.forEachChild(visit);
  return implementation;
}

function expressionContainsIdentifier(expression: ts.Expression, name: string): boolean {
  if (is.isIdentifier(expression)) return expression.text === name;
  let found = false;
  expression.forEachChild((child) => {
    if (!found && is.isExpression(child)) found = expressionContainsIdentifier(child, name);
  });
  return found;
}

function getLitMixinNames(node: ts.ClassLikeDeclaration, checker?: Checker): string[] {
  const names: string[] = [];
  const heritage = node.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const visit = (expression: ts.Expression) => {
    if (!is.isCallExpression(expression)) return;
    if (is.isIdentifier(expression.expression) && expression.expression.text !== "LitElement") {
      names.push(expression.expression.text);
    }
    for (const argument of expression.arguments) {
      if (is.isCallExpression(argument)) {
        visit(argument);
      } else if (checker && is.isIdentifier(argument) && argument.text !== "LitElement") {
        const symbol = checker.getSymbolAtLocation(argument);
        const resolved =
          symbol && symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        const declaration = symbolDeclarations(resolved, [ts.SyntaxKind.ClassDeclaration]).find(
          is.isClassDeclaration,
        );
        if (declaration) {
          const base = declaration.heritageClauses?.find(
            (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
          );
          if (base?.types[0]) visit((base.types[0] as ts.ExpressionWithTypeArguments).expression);
        }
      }
    }
  };
  const expression = (heritage?.types[0] as ts.ExpressionWithTypeArguments)?.expression;
  if (expression) visit(expression);
  return [...new Set(names)];
}

function getLitBaseClassMembers(
  node: ts.ClassDeclaration,
  context: FileContext,
  mixins: Map<string, LitMixin>,
  baseMemberResults: WeakMap<ts.ClassDeclaration, ClassFragment["members"]>,
  mixinResults: WeakMap<ts.Declaration, LitMixin | undefined>,
): ClassFragment["members"] {
  if (baseMemberResults.has(node)) return baseMemberResults.get(node);

  const heritage = node.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const baseMembers: ClassFragment["members"][] = [];

  function visit(expression: ts.Expression) {
    if (is.isCallExpression(expression)) {
      for (const argument of expression.arguments) visit(argument);
      return;
    }
    if (!is.isIdentifier(expression) || expression.text === "LitElement") return;
    const symbol = context.checker.getSymbolAtLocation(expression);
    const resolved =
      symbol && symbol.flags & SymbolFlags.Alias
        ? context.checker.getAliasedSymbol(symbol)
        : symbol;
    const declaration = symbolDeclarations(resolved, [ts.SyntaxKind.ClassDeclaration]).find(
      is.isClassDeclaration,
    );
    if (!declaration) return;

    const nestedMembers = getLitMixinNames(declaration, context.checker).flatMap((name) => {
      const mixin = resolveLitMixin(name, declaration, context, mixins, new Set(), mixinResults);
      return mixin?.members ? [mixin.members] : [];
    });
    const ownMembers = mergeLitMembers(
      filterLitMembers(detectClassMembers(declaration, context)),
      getDecoratedProperties(declaration, context),
      getStaticPropertyMetadata(declaration),
    );
    const members = mergeLitMembers(...nestedMembers, ownMembers);
    if (members) {
      const baseName = declaration.name?.text ?? expression.getText();
      baseMembers.push(
        members.map((member) => ({
          ...member,
          inheritedFrom: member.inheritedFrom ?? {
            name: baseName,
            module: declaration.getSourceFile().fileName,
          },
        })),
      );
    }
  }

  const expression = (heritage?.types[0] as ts.ExpressionWithTypeArguments)?.expression;
  if (expression) visit(expression);
  const result = mergeLitMembers(...baseMembers);
  baseMemberResults.set(node, result);
  return result;
}

function getLitSuperclass(
  node: ts.ClassDeclaration,
  checker: Checker,
): { name: string; module?: string } {
  const heritage = node.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const expression = (heritage?.types[0] as ts.ExpressionWithTypeArguments)?.expression;

  if (!expression || is.isCallExpression(expression)) {
    return { name: "LitElement", module: "lit" };
  }

  const name = expression.getText();
  if (name === "LitElement") return { name, module: "lit" };
  if (!is.isIdentifier(expression)) return { name, module: "lit" };

  const symbol = checker.getSymbolAtLocation(expression);
  const resolved =
    symbol && symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const declaration = symbolDeclarations(resolved, [ts.SyntaxKind.ClassDeclaration]).find(
    is.isClassDeclaration,
  );
  if (!declaration?.name) return { name, module: "lit" };

  return {
    name: declaration.name.text,
    module: declaration.getSourceFile().fileName,
  };
}

function extendsLitElement(node: ts.ClassDeclaration, checker: Checker): boolean {
  return inheritsFrom(
    node,
    checker,
    ({ expression }) => is.isIdentifier(expression) && expression.text === "LitElement",
  );
}

/** Detects `@property({...}) name: Type;` and `@state() name: Type;` fields. */
function getDecoratedProperties(
  node: ts.ClassLikeDeclaration,
  context: FileContext,
): ClassFragment["members"] {
  const members: NonNullable<ClassFragment["members"]> = [];

  for (const member of node.members) {
    if (!is.isPropertyDeclaration(member)) continue;
    const decorators = getDecorators(member) ?? [];

    const propertyDecorator = decorators.find((d) => {
      const name = getDecoratorName(d, node.getSourceFile());
      return [
        "property",
        "state",
        "internalProperty",
        "query",
        "queryAll",
        "queryAsync",
        "queryAssignedElements",
        "queryAssignedNodes",
      ].includes(name ?? "");
    });
    if (!propertyDecorator) continue;

    const decoratorName = getDecoratorName(propertyDecorator, node.getSourceFile());
    const isInternal = [
      "state",
      "internalProperty",
      "query",
      "queryAll",
      "queryAsync",
      "queryAssignedElements",
      "queryAssignedNodes",
    ].includes(decoratorName ?? "");
    const options = getDecoratorOptions(propertyDecorator);
    const nameText = member.name.getText();
    const jsdoc = getJSDocInfo(member);
    const memberDoc = parseCemMemberTags(member);
    if (memberDoc.internal) continue;
    const modifiers = getModifiers(member);
    const typeText = getNodeTypeText(member, context.checker);
    const parsedTypeText = shouldParseDecoratedType(member, modifiers, context.typeParsing)
      ? getParsedTypeText(member, context.checker)
      : undefined;

    members.push({
      name: nameText,
      kind: "field",
      type: typeText,
      parsedType:
        parsedTypeText &&
        !areTypeTextsEquivalent(parsedTypeText, typeText, {
          ignoreUndefined: true,
        })
          ? parsedTypeText
          : undefined,
      description: jsdoc.description || undefined,
      summary: memberDoc.summary,
      deprecated: memberDoc.deprecated,
      privacy: getPrivacy(modifiers),
      static: modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword) || undefined,
      readonly: modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ReadonlyKeyword) || undefined,
      internal: isInternal || memberDoc.internal || undefined,
      attribute:
        isInternal || options.noAttribute
          ? undefined
          : (options.attribute ?? memberDoc.attribute ?? nameText),
      reflects: options.reflect ?? memberDoc.reflects,
      default: memberDoc.default ?? getLiteralDefaultText(member.initializer, context.checker),
    });
  }

  return members;
}

function shouldParseDecoratedType(
  member: ts.PropertyDeclaration,
  modifiers: readonly ts.Modifier[] | undefined,
  mode: FileContext["typeParsing"],
): boolean {
  if (mode === "none") return false;
  if (mode === "all") return true;
  return !modifiers?.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.PrivateKeyword ||
      modifier.kind === ts.SyntaxKind.ProtectedKeyword ||
      modifier.kind === ts.SyntaxKind.StaticKeyword,
  );
}

function mergeLitMembers(...sources: ClassFragment["members"][]): ClassFragment["members"] {
  const byName = new Map<string, NonNullable<ClassFragment["members"]>[number]>();
  for (const source of sources) {
    for (const member of source ?? [])
      byName.set(member.name, { ...byName.get(member.name), ...member });
  }
  return byName.size ? [...byName.values()] : undefined;
}

type LitPropertyOptions = {
  attribute?: string;
  noAttribute?: boolean;
  reflect?: boolean;
  type?: string;
};

function getDecoratorName(decorator: ts.Decorator, sourceFile: ts.SourceFile): string | undefined {
  const expression = is.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression;
  if (!is.isIdentifier(expression)) return undefined;

  const names = decoratorNameCache.get(sourceFile) ?? new Map<string, string | undefined>();
  if (names.has(expression.text)) return names.get(expression.text);

  for (const statement of sourceFile.statements) {
    if (!is.isImportDeclaration(statement) || !is.isStringLiteral(statement.moduleSpecifier))
      continue;
    const moduleName = statement.moduleSpecifier.text;
    if (moduleName !== "lit" && moduleName !== "lit/decorators.js") continue;
    const named = statement.importClause?.namedBindings;
    if (!named || !is.isNamedImports(named)) continue;
    const imported = named.elements.find((element) => element.name.text === expression.text);
    if (imported) {
      const name = imported.propertyName?.text ?? imported.name.text;
      names.set(expression.text, name);
      decoratorNameCache.set(sourceFile, names);
      return name;
    }
  }

  names.set(expression.text, expression.text);
  decoratorNameCache.set(sourceFile, names);
  return expression.text;
}

function getDecoratorOptions(decorator: ts.Decorator): LitPropertyOptions {
  if (!is.isCallExpression(decorator.expression)) return {};
  const options = decorator.expression.arguments[0];
  if (!options || !is.isObjectLiteralExpression(options)) return {};

  const result: LitPropertyOptions = {};
  for (const property of options.properties) {
    if (!is.isPropertyAssignment(property) || !is.isIdentifier(property.name)) continue;
    const name = property.name.text;
    if (name === "attribute") {
      if (property.initializer.kind === ts.SyntaxKind.FalseKeyword) {
        result.noAttribute = true;
        continue;
      }
      if (is.isStringLiteralLikeNode(property.initializer))
        result.attribute = property.initializer.text;
    } else if (name === "reflect" && property.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      result.reflect = true;
    } else if (name === "type") {
      result.type = getLitTypeText(property.initializer);
    }
  }
  return result;
}

function getStaticPropertyMetadata(node: ts.ClassLikeDeclaration): ClassFragment["members"] {
  const properties = node.members.find(
    (member): member is ts.PropertyDeclaration | ts.GetAccessorDeclaration =>
      (is.isPropertyDeclaration(member) || is.isGetAccessorDeclaration(member)) &&
      member.name.getText() === "properties" &&
      !!getModifiers(member)?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword),
  );
  if (!properties) return undefined;
  const initializer = is.isPropertyDeclaration(properties)
    ? properties.initializer
    : properties?.body?.statements.find(is.isReturnStatement)?.expression;
  if (!initializer || !is.isObjectLiteralExpression(initializer)) return undefined;
  const constructorDefaults = getConstructorPropertyDefaults(node);

  const members: NonNullable<ClassFragment["members"]> = [];
  for (const property of initializer.properties) {
    if (!is.isPropertyAssignment(property) || !property.name) continue;
    const name = property.name.getText().replace(/^['"]|['"]$/g, "");
    if (!is.isObjectLiteralExpression(property.initializer)) continue;

    const options = getObjectOptions(property.initializer);
    members.push({
      name,
      kind: "field",
      type: options.type,
      attribute: options.noAttribute ? undefined : (options.attribute ?? name),
      reflects: options.reflect,
      default: options.default ?? constructorDefaults.get(name),
    });
  }
  return members;
}

function getConstructorPropertyDefaults(node: ts.ClassLikeDeclaration): Map<string, string> {
  const defaults = new Map<string, string>();
  const constructor = node.members.find(is.isConstructorDeclaration);
  for (const statement of constructor?.body?.statements ?? []) {
    if (!is.isExpressionStatement(statement) || !is.isBinaryExpression(statement.expression))
      continue;
    const assignment = statement.expression;
    if (assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue;
    if (
      !is.isPropertyAccessExpression(assignment.left) ||
      assignment.left.expression.kind !== ts.SyntaxKind.ThisKeyword
    )
      continue;
    defaults.set(assignment.left.name.text, assignment.right.getText());
  }
  return defaults;
}

function getObjectOptions(
  object: ts.ObjectLiteralExpression,
): LitPropertyOptions & { default?: string } {
  const result: LitPropertyOptions & { default?: string } = {};
  for (const property of object.properties) {
    if (!is.isPropertyAssignment(property) || !is.isIdentifier(property.name)) continue;
    const name = property.name.text;
    if (name === "attribute") {
      if (property.initializer.kind === ts.SyntaxKind.FalseKeyword) {
        result.noAttribute = true;
        continue;
      }
      if (is.isStringLiteralLikeNode(property.initializer))
        result.attribute = property.initializer.text;
    } else if (name === "reflect" && property.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      result.reflect = true;
    } else if (name === "type") {
      result.type = getLitTypeText(property.initializer);
    }
  }
  return result;
}

function getLitTypeText(node: ts.Expression): string | undefined {
  const name = node.getText();
  return (
    (
      {
        String: "string",
        Number: "number",
        Boolean: "boolean",
        Object: "object",
        Array: "array",
      } as Record<string, string>
    )[name] ?? name
  );
}

function getCustomElementTagName(node: ts.ClassDeclaration): string | undefined {
  for (const decorator of getDecorators(node) ?? []) {
    if (
      getDecoratorName(decorator, node.getSourceFile()) !== "customElement" ||
      !is.isCallExpression(decorator.expression)
    )
      continue;
    const tag = decorator.expression.arguments[0];
    if (tag && is.isStringLiteralLikeNode(tag)) return tag.text;
  }
  return undefined;
}

function filterLitMembers(members: ClassFragment["members"]): ClassFragment["members"] {
  const frameworkMembers = new Set([
    "properties",
    "styles",
    "render",
    "connectedCallback",
    "disconnectedCallback",
    "attributeChangedCallback",
    "adoptedCallback",
    "shouldUpdate",
    "willUpdate",
    "update",
    "updated",
    "firstUpdated",
    "performUpdate",
    "getUpdateComplete",
    "requestUpdate",
    "scheduleUpdate",
    "createRenderRoot",
    "controllers",
    "addController",
    "removeController",
    "hostConnected",
    "hostDisconnected",
  ]);
  const filtered = members?.filter((member) => !frameworkMembers.has(member.name));
  return filtered?.length ? filtered : undefined;
}

function getPrivacy(
  modifiers: readonly ts.Modifier[] | undefined,
): "public" | "private" | "protected" | undefined {
  if (!modifiers) return undefined;
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)) return "private";
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)) return "protected";
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.PublicKeyword)) return "public";
  return undefined;
}

function applyMemberToAttributeLinks(
  classFragment: ManifestFragment[string],
  classDoc: {
    properties?: Array<{ name: string; description?: string; type?: string }>;
  },
) {
  if (!classFragment.members) return;

  const byName = new Map(classFragment.members.map((m) => [m.name, m]));
  for (const prop of classDoc.properties ?? []) {
    const existing = byName.get(prop.name);
    if (existing) {
      existing.description = existing.description ?? prop.description;
      existing.type = existing.type ?? prop.type;
      continue;
    }
    classFragment.members.push({
      name: prop.name,
      kind: "field",
      description: prop.description,
      type: prop.type,
    });
  }

  for (const member of classFragment.members) {
    const m = member as Record<string, unknown>;
    const attr = typeof m.attribute === "string" ? m.attribute : undefined;
    if (!attr) continue;
    const attrs = (classFragment.attributes ??= []);
    let existingAttr = attrs.find((a) => a.name === attr);
    if (!existingAttr) {
      existingAttr = { name: attr };
      attrs.push(existingAttr);
    }
    existingAttr.type = existingAttr.type ?? (typeof m.type === "string" ? m.type : undefined);
    (existingAttr as Record<string, unknown>).parsedType =
      (existingAttr as Record<string, unknown>).parsedType ??
      (typeof m.parsedType === "string" ? m.parsedType : undefined);
    existingAttr.description = existingAttr.description ?? member.description;
    (existingAttr as Record<string, unknown>).default =
      (existingAttr as Record<string, unknown>).default ??
      (typeof m.default === "string" ? m.default : undefined);
    (existingAttr as Record<string, unknown>).fieldName =
      (existingAttr as Record<string, unknown>).fieldName ?? member.name;
  }
}

function mergeCssProperties(
  a: ClassFragment["cssProperties"],
  b: ClassFragment["cssProperties"],
): ClassFragment["cssProperties"] {
  const merged = new Map<string, NonNullable<ClassFragment["cssProperties"]>[number]>();
  for (const item of a ?? []) merged.set(item.name, item);
  for (const item of b ?? []) merged.set(item.name, { ...merged.get(item.name), ...item });
  return merged.size ? [...merged.values()] : undefined;
}

function mergeCssParts(
  a: ClassFragment["cssParts"],
  b: ClassFragment["cssParts"],
): ClassFragment["cssParts"] {
  const merged = new Map<string, NonNullable<ClassFragment["cssParts"]>[number]>();
  for (const item of a ?? []) merged.set(item.name, item);
  for (const item of b ?? []) merged.set(item.name, { ...merged.get(item.name), ...item });
  return merged.size ? [...merged.values()] : undefined;
}

function mergeSlots(
  discovered: ClassFragment["slots"],
  jsdoc: ClassFragment["slots"],
): ClassFragment["slots"] {
  const merged = new Map<string, NonNullable<ClassFragment["slots"]>[number]>();
  for (const slot of discovered ?? []) merged.set(slot.name, slot);
  for (const slot of jsdoc ?? []) merged.set(slot.name, { ...merged.get(slot.name), ...slot });
  return merged.size ? [...merged.values()] : undefined;
}

function extractCssCustomProps(
  node: ts.ClassDeclaration,
  checker: Checker,
): ClassFragment["cssProperties"] {
  const stylesMember = node.members.find((m): m is ts.PropertyDeclaration => {
    if (!is.isPropertyDeclaration(m) || m.name.getText() !== "styles") return false;
    const modifiers = getModifiers(m);
    return modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword) ?? false;
  });
  if (!stylesMember) return undefined;

  const properties = parseCssMetadata(stylesMember.getText()) ?? [];
  const initializer = stylesMember.initializer;
  if (!initializer) return properties.length ? properties : undefined;

  const symbol = is.isIdentifier(initializer)
    ? checker.getSymbolAtLocation(initializer)
    : undefined;
  const resolvedSymbol =
    symbol && symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

  for (const declaration of symbolDeclarations(resolvedSymbol, [
    ts.SyntaxKind.VariableDeclaration,
  ])) {
    if (!is.isVariableDeclaration(declaration) || !declaration.initializer) continue;
    properties.push(...(parseCssMetadata(declaration.initializer.getText()) ?? []));
  }

  const byName = new Map(properties.map((property) => [property.name, property]));
  return byName.size ? [...byName.values()] : undefined;
}
