import ts from "typescript";
import {
  type ClassFragment,
  type DetectorPlugin,
  type FileContext,
  type ManifestFragment,
} from "@wc-toolkit/cem-generator";
import { getJSDocInfo, parseCemClassTags } from "@wc-toolkit/cem-generator-utils";

/** Detects custom elements created with Vue's `defineCustomElement`. */
export function vuePlugin(): DetectorPlugin {
  return {
    name: "vue",

    claims(sourceText) {
      return /from\s+["']vue["']/.test(sourceText) &&
        /\bdefineCustomElement\s*\(/.test(sourceText);
    },

    onFile(context: FileContext): ManifestFragment {
      const fragment: ManifestFragment = {};
      const defineNames = getDefineCustomElementNames(context.sourceFile);
      const tags = getCustomElementRegistrations(context.sourceFile);

      ts.forEachChild(context.sourceFile, function visit(node) {
        if (!ts.isCallExpression(node) || !isDefineCustomElementCall(node, defineNames)) {
          ts.forEachChild(node, visit);
          return;
        }

        const declaration = findContainingVariable(node);
        const name = declaration?.name && ts.isIdentifier(declaration.name) ? declaration.name.text : undefined;
        if (!name) {
          ts.forEachChild(node, visit);
          return;
        }

        const component = node.arguments[0];
        const options = resolveComponentOptions(component, context);
        const classDoc = declaration ? parseCemClassTags(declaration) : {};
        const props = options ? getProps(options, context) : undefined;
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
          description: (declaration ? getJSDocInfo(declaration).description : undefined) || (options ? getJSDocInfo(options).description || undefined : undefined),
          summary: classDoc.summary,
          deprecated: classDoc.deprecated,
          tagName: classDoc.tagName ?? tags.get(name),
          members: props?.length ? props.map(({ name: _name, ...member }) => ({ name: _name, ...member })) : undefined,
          attributes: attributes?.length ? attributes : undefined,
          events: mergeEvents(events, classDoc.events),
          slots: classDoc.slots,
          cssParts: classDoc.cssParts,
          cssProperties: classDoc.cssProperties,
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

function getDefineCustomElementNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== "vue") continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === "defineCustomElement") names.add(element.name.text);
    }
  }
  return names;
}

function isDefineCustomElementCall(node: ts.CallExpression, names: Set<string>): boolean {
  return ts.isIdentifier(node.expression) && names.has(node.expression.text);
}

function getCustomElementRegistrations(sourceFile: ts.SourceFile): Map<string, string> {
  const tags = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.getText(sourceFile) === "customElements.define") {
      const tag = node.arguments[0];
      const constructor = node.arguments[1];
      if (tag && ts.isStringLiteralLike(tag) && constructor && ts.isIdentifier(constructor)) tags.set(constructor.text, tag.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return tags;
}

function findContainingVariable(node: ts.Node): ts.VariableDeclaration | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isVariableDeclaration(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function resolveComponentOptions(component: ts.Expression | undefined, context: FileContext): ts.ObjectLiteralExpression | undefined {
  if (!component) return undefined;
  if (ts.isObjectLiteralExpression(component)) return component;
  if (!ts.isIdentifier(component)) return undefined;
  const symbol = context.checker.getSymbolAtLocation(component);
  const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? context.checker.getAliasedSymbol(symbol) : symbol;
  const declaration = resolved?.declarations?.find(ts.isVariableDeclaration);
  const initializer = declaration?.initializer;
  if (initializer && ts.isObjectLiteralExpression(initializer)) return initializer;
  if (initializer && ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression) && initializer.expression.text === "defineComponent") {
    return initializer.arguments[0] && ts.isObjectLiteralExpression(initializer.arguments[0]) ? initializer.arguments[0] : undefined;
  }
  return undefined;
}

function getProps(options: ts.ObjectLiteralExpression, context: FileContext): NonNullable<ClassFragment["members"]> {
  const props = getObjectProperty(options, "props");
  if (!props || !ts.isObjectLiteralExpression(props.initializer)) return [];
  return props.initializer.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property)) return [];
    const name = getPropertyName(property.name);
    if (!name) return [];
    const metadata = getPropMetadata(property.initializer, context);
    return [{ name, kind: "field", type: metadata.type, description: getJSDocInfo(property).description || undefined, default: metadata.default }];
  });
}

function getPropMetadata(initializer: ts.Expression, context: FileContext): { type?: string; default?: string } {
  if (ts.isObjectLiteralExpression(initializer)) {
    const type = getObjectProperty(initializer, "type");
    const defaultValue = getObjectProperty(initializer, "default");
    return { type: type && getVueType(type.initializer, context), default: defaultValue?.initializer.getText() };
  }
  return { type: getVueType(initializer, context) };
}

function getVueType(node: ts.Expression, context: FileContext): string | undefined {
  const name = ts.isIdentifier(node) ? node.text : undefined;
  if (name === "String") return "string";
  if (name === "Number") return "number";
  if (name === "Boolean") return "boolean";
  if (name === "Object") return "object";
  if (name === "Array") return "array";
  return context.checker.typeToString(context.checker.getTypeAtLocation(node));
}

function getEmits(options: ts.ObjectLiteralExpression): ClassFragment["events"] {
  const emits = getObjectProperty(options, "emits");
  if (!emits) return undefined;
  if (ts.isArrayLiteralExpression(emits.initializer)) {
    return emits.initializer.elements.flatMap((event) => ts.isStringLiteralLike(event) ? [{ name: event.text }] : []);
  }
  if (ts.isObjectLiteralExpression(emits.initializer)) {
    return emits.initializer.properties.flatMap((property) => {
      const name = property.name && getPropertyName(property.name);
      return name ? [{ name }] : [];
    });
  }
  return undefined;
}

function mergeEvents(
  emitted: ClassFragment["events"],
  documented: ClassFragment["events"]
): ClassFragment["events"] {
  const events = new Map<string, NonNullable<ClassFragment["events"]>[number]>();
  for (const event of emitted ?? []) events.set(event.name, event);
  for (const event of documented ?? []) events.set(event.name, { ...events.get(event.name), ...event });
  return events.size ? [...events.values()] : undefined;
}

function getObjectProperty(object: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
  return object.properties.find((property): property is ts.PropertyAssignment =>
    ts.isPropertyAssignment(property) && getPropertyName(property.name) === name
  );
}

function getPropertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
}

function getExportName(node: ts.VariableDeclaration | undefined): string | undefined {
  const declaration = node?.parent.parent;
  if (!declaration || !ts.isVariableStatement(declaration)) return undefined;
  const modifiers = ts.canHaveModifiers(declaration) ? ts.getModifiers(declaration) : undefined;
  if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return undefined;
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? "default" : node?.name.getText();
}
