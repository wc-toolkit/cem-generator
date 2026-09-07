import ts from "typescript";
import {
  detectClassMembers,
  type DetectorPlugin,
  type FileContext,
  type ManifestFragment,
  type ClassFragment,
  mergeClassEvents,
  detectClassEvents,
  detectCustomElementRegistrations,
  parseCssMetadata,
} from "@wc-toolkit/cem-generator";
import {
  getJSDocInfo,
  getNodeTypeText,
  getParsedTypeText,
  resolveParsedTypeFromText,
  parseCemClassTags,
  parseCemMemberTags,
} from "@wc-toolkit/cem-generator-utils";

export function litPlugin(): DetectorPlugin {
  const registeredTags = new Map<string, string>();

  return {
    name: "lit",

    shouldAnalyze(sourceText) {
      return /from\s+['"]lit['"]/.test(sourceText) ||
        /extends\s+LitElement/.test(sourceText) ||
        /customElements\.define\s*\(/.test(sourceText);
    },

    onFile(context: FileContext): ManifestFragment {
      const fragment: ManifestFragment = {};
      const mixins = new Map<string, LitMixin>();
      const registrations = detectCustomElementRegistrations(context.sourceFile);
      for (const [className, tagName] of registrations) registeredTags.set(className, tagName);

      ts.forEachChild(context.sourceFile, function visit(node) {
        if (ts.isClassDeclaration(node) && node.name && extendsLitElement(node, context.checker)) {
          const className = node.name.text;
          const jsdoc = getJSDocInfo(node);
          const classDoc = parseCemClassTags(node);
          const mixinNames = getLitMixinNames(node);
          for (const name of mixinNames) resolveLitMixin(name, node, context, mixins, new Set());
          addMixinFragments(fragment, mixins);
          const ownMembers = mergeLitMembers(
            filterLitMembers(detectClassMembers(node, context)),
            getDecoratedProperties(node, context),
            getStaticPropertyMetadata(node)
          );
          const baseMembers = getLitBaseClassMembers(node, context, mixins);
          const members = mergeLitMembers(
            ...mixinNames.flatMap((name) => {
              const mixin = mixins.get(name);
              return mixin ? [mixin.members] : [];
            }),
            baseMembers,
            ownMembers,
            undefined
          );

          fragment[className] = {
            name: className,
            exportName: getExportName(node),
            module: context.filePath,
            description: jsdoc.description || undefined,
            summary: classDoc.summary,
            deprecated: classDoc.deprecated,
            tagName: classDoc.tagName ?? getCustomElementTagName(node) ?? registrations.get(className),
            superclass: { name: "LitElement", module: "lit" },
            ...(mixinNames.length
              ? { mixins: mixinNames.map((name) => ({ name, module: context.filePath })) }
              : {}),
            members,
            slots: classDoc.slots,
            events: mergeClassEvents(
              detectClassEvents(node, context),
              classDoc.events?.map((event) => ({
                ...event,
                parsedType: resolveParsedTypeFromText(event.type, context.sourceFile, context.checker),
              }))
            ),
            cssParts: mergeCssParts(extractCssParts(node), classDoc.cssParts),
            cssStates: classDoc.cssStates,
            cssProperties: mergeCssProperties(extractCssCustomProps(node), classDoc.cssProperties),
            omitInherited: classDoc.omitInherited,
            attributes: classDoc.attributes,
          };

          for (const attr of fragment[className].attributes ?? []) {
            attr.parsedType = resolveParsedTypeFromText(attr.type, context.sourceFile, context.checker);
          }

          applyMemberToAttributeLinks(fragment[className], classDoc);
        }
        ts.forEachChild(node, visit);
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

function extractCssParts(node: ts.ClassDeclaration): ClassFragment["cssParts"] {
  const text = node.getText();
  const attrMatches = [...text.matchAll(/\bpart\s*=\s*(["'])([^"']+)\1/g)];
  if (attrMatches.length === 0) return undefined;

  const byName = new Map<string, NonNullable<ClassFragment["cssParts"]>[number]>();
  for (const [, , rawValue] of attrMatches) {
    for (const token of rawValue.split(/\s+/).map((v) => v.trim()).filter(Boolean)) {
      if (!byName.has(token)) byName.set(token, { name: token });
    }
  }

  const commentBeforePartElement = [
    ...text.matchAll(/<!--([\s\S]*?)-->\s*<[^>]*\bpart\s*=\s*(["'])([^"']+)\2[^>]*>/g),
  ];
  for (const [, rawComment, , rawValue] of commentBeforePartElement) {
    const description = parseTemplateComment(rawComment);
    if (!description) continue;
    for (const token of rawValue.split(/\s+/).map((v) => v.trim()).filter(Boolean)) {
      const existing = byName.get(token);
      if (!existing) continue;
      if (!existing.description) existing.description = description;
    }
  }

  return byName.size ? [...byName.values()] : undefined;
}

function parseTemplateComment(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw
    .split("\n")
    .map((line) => line.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function getExportName(node: ts.ClassDeclaration): string | undefined {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
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
  resolving: Set<string>
): LitMixin | undefined {
  const existing = mixins.get(name);
  if (existing) return existing;
  if (resolving.has(name)) return undefined;
  resolving.add(name);

  const identifier = findMixinIdentifier(anchor, name);
  const symbol = identifier ? context.checker.getSymbolAtLocation(identifier) : undefined;
  const resolvedSymbol = symbol && symbol.flags & ts.SymbolFlags.Alias
    ? context.checker.getAliasedSymbol(symbol)
    : symbol;
  const declaration = resolvedSymbol?.declarations?.find(
    (candidate) => ts.isFunctionDeclaration(candidate) || ts.isVariableDeclaration(candidate)
  );
  const implementation = declaration ? findMixinImplementation(declaration) : undefined;
  if (!declaration || !implementation) {
    resolving.delete(name);
    return undefined;
  }

  const sourceFile = implementation.getSourceFile();
  const mixinContext: FileContext = {
    filePath: sourceFile.fileName,
    sourceText: sourceFile.getFullText(),
    sourceFile,
    checker: context.checker,
  };
  const nestedNames = getLitMixinNames(implementation);
  const nestedMembers = nestedNames.flatMap((nestedName) => {
    const nested = resolveLitMixin(nestedName, implementation, mixinContext, mixins, resolving);
    return nested?.members ? [nested.members] : [];
  });
  const ownMembers = mergeLitMembers(
    filterLitMembers(detectClassMembers(implementation, mixinContext)),
    getDecoratedProperties(implementation, mixinContext),
    getStaticPropertyMetadata(implementation)
  );
  const members = mergeLitMembers(...nestedMembers, ownMembers)?.map((member) => ({
    ...member,
    inheritedFrom: member.inheritedFrom ?? { name, module: sourceFile.fileName },
  }));
  if (!members?.length) {
    resolving.delete(name);
    return undefined;
  }

  const declarationModifiers = ts.canHaveModifiers(declaration) ? ts.getModifiers(declaration) : undefined;
  const result: LitMixin = {
    members,
    exportName: declarationModifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      ? name
      : undefined,
  };
  mixins.set(name, result);
  resolving.delete(name);
  return result;
}

function findMixinIdentifier(node: ts.ClassLikeDeclaration, name: string): ts.Identifier | undefined {
  const heritage = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
  let result: ts.Identifier | undefined;
  function visit(expression: ts.Expression) {
    if (result) return;
    if (ts.isCallExpression(expression)) {
      if (ts.isIdentifier(expression.expression) && expression.expression.text === name) {
        result = expression.expression;
        return;
      }
      for (const argument of expression.arguments) {
        if (ts.isExpression(argument)) visit(argument);
      }
    }
  }
  const expression = heritage?.types[0]?.expression;
  if (expression) visit(expression);
  return result;
}

function findMixinImplementation(declaration: ts.FunctionDeclaration | ts.VariableDeclaration): ts.ClassDeclaration | ts.ClassExpression | undefined {
  const callable = ts.isFunctionDeclaration(declaration)
    ? declaration
    : declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
      ? declaration.initializer
      : undefined;
  if (!callable || callable.parameters.length === 0) return undefined;
  const parameterName = callable.parameters[0].name.getText();
  let implementation: ts.ClassDeclaration | ts.ClassExpression | undefined;
  function visit(node: ts.Node) {
    if (implementation) return;
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const heritage = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
      if (heritage?.types[0] && expressionContainsIdentifier(heritage.types[0].expression, parameterName)) {
        implementation = node;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  if (callable.body) ts.forEachChild(callable.body, visit);
  return implementation;
}

function expressionContainsIdentifier(expression: ts.Expression, name: string): boolean {
  if (ts.isIdentifier(expression)) return expression.text === name;
  let found = false;
  ts.forEachChild(expression, (child) => {
    if (!found && ts.isExpression(child)) found = expressionContainsIdentifier(child, name);
  });
  return found;
}

function getLitMixinNames(node: ts.ClassLikeDeclaration, checker?: ts.TypeChecker): string[] {
  const names: string[] = [];
  const heritage = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
  const visit = (expression: ts.Expression) => {
    if (!ts.isCallExpression(expression)) return;
    if (ts.isIdentifier(expression.expression) && expression.expression.text !== "LitElement") {
      names.push(expression.expression.text);
    }
    for (const argument of expression.arguments) {
      if (ts.isCallExpression(argument)) {
        visit(argument);
      } else if (checker && ts.isIdentifier(argument) && argument.text !== "LitElement") {
        const symbol = checker.getSymbolAtLocation(argument);
        const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        const declaration = resolved?.declarations?.find(ts.isClassDeclaration);
        if (declaration) {
          const base = declaration.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
          if (base?.types[0]) visit(base.types[0].expression);
        }
      }
    }
  };
  const expression = heritage?.types[0]?.expression;
  if (expression) visit(expression);
  return [...new Set(names)];
}

function getLitBaseClassMembers(
  node: ts.ClassDeclaration,
  context: FileContext,
  mixins: Map<string, LitMixin>
): ClassFragment["members"] {
  const heritage = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
  const baseMembers: ClassFragment["members"][] = [];

  function visit(expression: ts.Expression) {
    if (ts.isCallExpression(expression)) {
      for (const argument of expression.arguments) visit(argument);
      return;
    }
    if (!ts.isIdentifier(expression) || expression.text === "LitElement") return;
    const symbol = context.checker.getSymbolAtLocation(expression);
    const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? context.checker.getAliasedSymbol(symbol) : symbol;
    const declaration = resolved?.declarations?.find(ts.isClassDeclaration);
    if (!declaration) return;

    const nestedMembers = getLitMixinNames(declaration, context.checker).flatMap((name) => {
      const mixin = resolveLitMixin(name, declaration, context, mixins, new Set());
      return mixin?.members ? [mixin.members] : [];
    });
    const ownMembers = mergeLitMembers(
      filterLitMembers(detectClassMembers(declaration, context)),
      getDecoratedProperties(declaration, context),
      getStaticPropertyMetadata(declaration)
    );
    const members = mergeLitMembers(...nestedMembers, ownMembers);
    if (members) baseMembers.push(members);
  }

  const expression = heritage?.types[0]?.expression;
  if (expression) visit(expression);
  return mergeLitMembers(...baseMembers);
}

function extendsLitElement(node: ts.ClassDeclaration, checker: ts.TypeChecker): boolean {
  const heritage = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
  const seen = new Set<ts.Node>();
  const containsLitElement = (expression: ts.Expression): boolean => {
    if (seen.has(expression)) return false;
    seen.add(expression);
    if (expression.getText() === "LitElement") return true;
    if (ts.isCallExpression(expression)) {
      return expression.arguments.some((argument) => containsLitElement(argument));
    }
    if (ts.isIdentifier(expression)) {
      const symbol = checker.getSymbolAtLocation(expression);
      const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      const declaration = resolved?.declarations?.find(ts.isClassDeclaration);
      const base = declaration?.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
      return !!base?.types[0] && containsLitElement(base.types[0].expression);
    }
    return false;
  };
  return !!heritage?.types.some((type) => containsLitElement(type.expression));
}

/** Detects `@property({...}) name: Type;` and `@state() name: Type;` fields. */
function getDecoratedProperties(node: ts.ClassLikeDeclaration, context: FileContext): ClassFragment["members"] {
  const members: NonNullable<ClassFragment["members"]> = [];

  for (const member of node.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    const decorators = ts.getDecorators?.(member) ?? [];

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
    const isState = decoratorName === "state";
    const options = getDecoratorOptions(propertyDecorator);
    const nameText = member.name.getText();
    const jsdoc = getJSDocInfo(member);
    const memberDoc = parseCemMemberTags(member);
    if (memberDoc.internal) continue;
    const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
    const typeText = getNodeTypeText(member, context.checker);
    const parsedTypeText = getParsedTypeText(member, context.checker);

    members.push({
      name: nameText,
      kind: "field",
      type: typeText,
      parsedType: parsedTypeText && parsedTypeText !== typeText ? parsedTypeText : undefined,
      description: jsdoc.description || undefined,
      summary: memberDoc.summary,
      deprecated: memberDoc.deprecated,
      privacy: getPrivacy(modifiers),
      static: modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword) || undefined,
      readonly: modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ReadonlyKeyword) || undefined,
      internal: isInternal || memberDoc.internal || undefined,
      attribute: isInternal || options.noAttribute ? undefined : options.attribute ?? memberDoc.attribute ?? nameText,
      reflects: options.reflect ?? memberDoc.reflects,
      default: memberDoc.default,
    });
  }

  return members;
}

function mergeLitMembers(
  ...sources: ClassFragment["members"][]
): ClassFragment["members"] {
  const byName = new Map<string, NonNullable<ClassFragment["members"]>[number]>();
  for (const source of sources) {
    for (const member of source ?? []) byName.set(member.name, { ...byName.get(member.name), ...member });
  }
  return byName.size ? [...byName.values()] : undefined;
}

type LitPropertyOptions = { attribute?: string; noAttribute?: boolean; reflect?: boolean; type?: string };

function getDecoratorName(decorator: ts.Decorator, sourceFile: ts.SourceFile): string | undefined {
  const expression = ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression;
  if (!ts.isIdentifier(expression)) return undefined;

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = statement.moduleSpecifier.text;
    if (moduleName !== "lit" && moduleName !== "lit/decorators.js") continue;
    const named = statement.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    const imported = named.elements.find((element) => element.name.text === expression.text);
    if (imported) return imported.propertyName?.text ?? imported.name.text;
  }

  return expression.text;
}

function getDecoratorOptions(decorator: ts.Decorator): LitPropertyOptions {
  if (!ts.isCallExpression(decorator.expression)) return {};
  const options = decorator.expression.arguments[0];
  if (!options || !ts.isObjectLiteralExpression(options)) return {};

  const result: LitPropertyOptions = {};
  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
    const name = property.name.text;
    if (name === "attribute") {
      if (property.initializer.kind === ts.SyntaxKind.FalseKeyword) {
        result.noAttribute = true;
        continue;
      }
      if (ts.isStringLiteralLike(property.initializer)) result.attribute = property.initializer.text;
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
      (ts.isPropertyDeclaration(member) || ts.isGetAccessorDeclaration(member)) &&
      member.name.getText() === "properties" &&
      !!(ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined)?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword
      )
  );
  if (!properties) return undefined;
  const initializer = ts.isPropertyDeclaration(properties)
    ? properties.initializer
    : properties?.body?.statements.find(ts.isReturnStatement)?.expression;
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) return undefined;
  const constructorDefaults = getConstructorPropertyDefaults(node);

  const members: NonNullable<ClassFragment["members"]> = [];
  for (const property of initializer.properties) {
    if (!ts.isPropertyAssignment(property) || !property.name) continue;
    const name = property.name.getText().replace(/^['"]|['"]$/g, "");
    if (!ts.isObjectLiteralExpression(property.initializer)) continue;

    const options = getObjectOptions(property.initializer);
    members.push({
      name,
      kind: "field",
      type: options.type,
      attribute: options.noAttribute ? undefined : options.attribute ?? name,
      reflects: options.reflect,
      default: options.default ?? constructorDefaults.get(name),
    });
  }
  return members;
}

function getConstructorPropertyDefaults(node: ts.ClassLikeDeclaration): Map<string, string> {
  const defaults = new Map<string, string>();
  const constructor = node.members.find(ts.isConstructorDeclaration);
  for (const statement of constructor?.body?.statements ?? []) {
    if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)) continue;
    const assignment = statement.expression;
    if (assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue;
    if (!ts.isPropertyAccessExpression(assignment.left) || assignment.left.expression.kind !== ts.SyntaxKind.ThisKeyword) continue;
    defaults.set(assignment.left.name.text, assignment.right.getText());
  }
  return defaults;
}

function getObjectOptions(object: ts.ObjectLiteralExpression): LitPropertyOptions & { default?: string } {
  const result: LitPropertyOptions & { default?: string } = {};
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
    const name = property.name.text;
    if (name === "attribute") {
      if (property.initializer.kind === ts.SyntaxKind.FalseKeyword) {
        result.noAttribute = true;
        continue;
      }
      if (ts.isStringLiteralLike(property.initializer)) result.attribute = property.initializer.text;
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
  return ({ String: "string", Number: "number", Boolean: "boolean", Object: "object", Array: "array" } as Record<string, string>)[name] ?? name;
}

function getCustomElementTagName(node: ts.ClassDeclaration): string | undefined {
  for (const decorator of ts.getDecorators?.(node) ?? []) {
    if (getDecoratorName(decorator, node.getSourceFile()) !== "customElement" || !ts.isCallExpression(decorator.expression)) continue;
    const tag = decorator.expression.arguments[0];
    if (tag && ts.isStringLiteralLike(tag)) return tag.text;
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

function getPrivacy(modifiers: readonly ts.Modifier[] | undefined): "public" | "private" | "protected" | undefined {
  if (!modifiers) return undefined;
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)) return "private";
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)) return "protected";
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.PublicKeyword)) return "public";
  return undefined;
}

function applyMemberToAttributeLinks(
  classFragment: ManifestFragment[string],
  classDoc: { properties?: Array<{ name: string; description?: string; type?: string }> }
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
  b: ClassFragment["cssProperties"]
): ClassFragment["cssProperties"] {
  const merged = new Map<string, NonNullable<ClassFragment["cssProperties"]>[number]>();
  for (const item of a ?? []) merged.set(item.name, item);
  for (const item of b ?? []) merged.set(item.name, { ...merged.get(item.name), ...item });
  return merged.size ? [...merged.values()] : undefined;
}

function mergeCssParts(a: ClassFragment["cssParts"], b: ClassFragment["cssParts"]): ClassFragment["cssParts"] {
  const merged = new Map<string, NonNullable<ClassFragment["cssParts"]>[number]>();
  for (const item of a ?? []) merged.set(item.name, item);
  for (const item of b ?? []) merged.set(item.name, { ...merged.get(item.name), ...item });
  return merged.size ? [...merged.values()] : undefined;
}

function extractCssCustomProps(node: ts.ClassDeclaration): ClassFragment["cssProperties"] {
  const stylesMember = node.members.find((m) => {
    if (!ts.isPropertyDeclaration(m) || m.name.getText() !== "styles") return false;
    const modifiers = ts.canHaveModifiers(m) ? ts.getModifiers(m) : undefined;
    return modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword);
  });
  if (!stylesMember) return undefined;
  return parseCssMetadata(stylesMember.getText());
}
