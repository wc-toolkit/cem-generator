import * as ts from "typescript/ast";
import {
  symbolDeclarations,
  getModifiers,
  getJSDocInfo,
  parseCemClassTags,
  typeAtLocation,
  typeToText,
} from "@wc-toolkit/cem-generator-utils";
import { SymbolFlags } from "typescript/sync";
import * as is from "typescript/ast/is";
import {
  type ClassFragment,
  type DetectorPlugin,
  type FileContext,
  type ManifestFragment,
  discoverFrameworkApis,
} from "@wc-toolkit/cem-generator";

/** Detects custom elements created with Vue's `defineCustomElement`. */
export function vuePlugin(): DetectorPlugin {
  return {
    name: "vue",

    shouldAnalyze(sourceText) {
      return /from\s+["']vue["']/.test(sourceText) && /\bdefineCustomElement\s*\(/.test(sourceText);
    },

    onFile(context: FileContext): ManifestFragment {
      const fragment: ManifestFragment = {};
      const defineNames = getDefineCustomElementNames(context.sourceFile);
      const tags = getCustomElementRegistrations(context.sourceFile);

      context.sourceFile.forEachChild(function visit(node) {
        if (!is.isCallExpression(node) || !isDefineCustomElementCall(node, defineNames)) {
          node.forEachChild(visit);
          return;
        }

        const declaration = findContainingVariable(node);
        const name =
          declaration?.name && is.isIdentifier(declaration.name)
            ? declaration.name.text
            : undefined;
        if (!name) {
          node.forEachChild(visit);
          return;
        }

        const component = node.arguments[0];
        const options = resolveComponentOptions(component, context);
        const classDoc = declaration ? parseCemClassTags(declaration) : {};
        const props = options ? getProps(options, context) : undefined;
        const discovered = options
          ? discoverFrameworkApis(options, context.sourceFile, context.checker)
          : {};
        const attributes = props?.map(({ name: fieldName, ...member }) => ({
          name: fieldName,
          type: member.type,
          description: member.description,
          fieldName,
        }));
        const events = options ? getEmits(options) : undefined;

        fragment[name] = {
          name,
          exportName: getExportName(declaration),
          module: context.filePath,
          description:
            (declaration ? getJSDocInfo(declaration).description : undefined) ||
            (options ? getJSDocInfo(options).description || undefined : undefined),
          summary: classDoc.summary,
          deprecated: classDoc.deprecated,
          tagName: classDoc.tagName ?? tags.get(name),
          members: props?.length
            ? props.map(({ name: _name, ...member }) => ({ name: _name, ...member }))
            : undefined,
          attributes: attributes?.length ? attributes : undefined,
          events: mergeEvents(mergeEvents(events, discovered.events), classDoc.events),
          slots: mergeNamed(discovered.slots, classDoc.slots),
          cssParts: mergeNamed(discovered.cssParts, classDoc.cssParts),
          cssProperties: mergeNamed(discovered.cssProperties, classDoc.cssProperties),
          cssStates: mergeNamed(discovered.cssStates, classDoc.cssStates),
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

function getDefineCustomElementNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !is.isImportDeclaration(statement) ||
      !is.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "vue"
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !is.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === "defineCustomElement")
        names.add(element.name.text);
    }
  }
  return names;
}

function isDefineCustomElementCall(node: ts.CallExpression, names: Set<string>): boolean {
  return is.isIdentifier(node.expression) && names.has(node.expression.text);
}

function getCustomElementRegistrations(sourceFile: ts.SourceFile): Map<string, string> {
  const tags = new Map<string, string>();
  function visit(node: ts.Node) {
    if (
      is.isCallExpression(node) &&
      is.isPropertyAccessExpression(node.expression) &&
      node.expression.getText(sourceFile) === "customElements.define"
    ) {
      const tag = node.arguments[0];
      const constructor = node.arguments[1];
      if (tag && is.isStringLiteralLikeNode(tag) && constructor && is.isIdentifier(constructor))
        tags.set(constructor.text, tag.text);
    }
    node.forEachChild(visit);
  }
  visit(sourceFile);
  return tags;
}

function findContainingVariable(node: ts.Node): ts.VariableDeclaration | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current && !is.isSourceFile(current)) {
    if (is.isVariableDeclaration(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function resolveComponentOptions(
  component: ts.Expression | undefined,
  context: FileContext,
): ts.ObjectLiteralExpression | undefined {
  if (!component) return undefined;
  if (is.isObjectLiteralExpression(component)) return component;
  if (!is.isIdentifier(component)) return undefined;
  const symbol = context.checker.getSymbolAtLocation(component);
  const resolved =
    symbol && symbol.flags & SymbolFlags.Alias ? context.checker.getAliasedSymbol(symbol) : symbol;
  const declaration = symbolDeclarations(resolved, [ts.SyntaxKind.VariableDeclaration]).find(
    is.isVariableDeclaration,
  );
  const initializer = declaration?.initializer;
  if (initializer && is.isObjectLiteralExpression(initializer)) return initializer;
  if (
    initializer &&
    is.isCallExpression(initializer) &&
    is.isIdentifier(initializer.expression) &&
    initializer.expression.text === "defineComponent"
  ) {
    return initializer.arguments[0] && is.isObjectLiteralExpression(initializer.arguments[0])
      ? initializer.arguments[0]
      : undefined;
  }
  return undefined;
}

function getProps(
  options: ts.ObjectLiteralExpression,
  context: FileContext,
): NonNullable<ClassFragment["members"]> {
  const props = getObjectProperty(options, "props");
  if (!props || !is.isObjectLiteralExpression(props.initializer)) return [];
  return props.initializer.properties.flatMap((property) => {
    if (!is.isPropertyAssignment(property)) return [];
    const name = getPropertyName(property.name);
    if (!name) return [];
    const metadata = getPropMetadata(property.initializer, context);
    return [
      {
        name,
        kind: "field",
        type: metadata.type,
        description: getJSDocInfo(property).description || undefined,
        default: metadata.default,
      },
    ];
  });
}

function getPropMetadata(
  initializer: ts.Expression,
  context: FileContext,
): { type?: string; default?: string } {
  if (is.isObjectLiteralExpression(initializer)) {
    const type = getObjectProperty(initializer, "type");
    const defaultValue = getObjectProperty(initializer, "default");
    return {
      type: type && getVueType(type.initializer, context),
      default: defaultValue?.initializer.getText(),
    };
  }
  return { type: getVueType(initializer, context) };
}

function getVueType(node: ts.Expression, context: FileContext): string | undefined {
  const name = is.isIdentifier(node) ? node.text : undefined;
  if (name === "String") return "string";
  if (name === "Number") return "number";
  if (name === "Boolean") return "boolean";
  if (name === "Object") return "object";
  if (name === "Array") return "array";
  return typeToText(typeAtLocation(node, context.checker), context.checker);
}

function getEmits(options: ts.ObjectLiteralExpression): ClassFragment["events"] {
  const emits = getObjectProperty(options, "emits");
  if (!emits) return undefined;
  if (is.isArrayLiteralExpression(emits.initializer)) {
    return emits.initializer.elements.flatMap((event) =>
      is.isStringLiteralLikeNode(event) ? [{ name: event.text }] : [],
    );
  }
  if (is.isObjectLiteralExpression(emits.initializer)) {
    return emits.initializer.properties.flatMap((property) => {
      const propertyName = (property as { name?: ts.PropertyName }).name;
      const name = propertyName && getPropertyName(propertyName);
      return name ? [{ name }] : [];
    });
  }
  return undefined;
}

function mergeEvents(
  emitted: ClassFragment["events"],
  documented: ClassFragment["events"],
): ClassFragment["events"] {
  const events = new Map<string, NonNullable<ClassFragment["events"]>[number]>();
  for (const event of emitted ?? []) events.set(event.name, event);
  for (const event of documented ?? [])
    events.set(event.name, { ...events.get(event.name), ...event });
  return events.size ? [...events.values()] : undefined;
}

function getObjectProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | undefined {
  return object.properties.find(
    (property): property is ts.PropertyAssignment =>
      is.isPropertyAssignment(property) && getPropertyName(property.name) === name,
  );
}

function getPropertyName(name: ts.PropertyName): string | undefined {
  return is.isIdentifier(name) || is.isStringLiteralLikeNode(name) ? name.text : undefined;
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
