import ts from "typescript";
import {
  detectClassMembers,
  detectClassEvents,
  mergeClassEvents,
  type ClassFragment,
  type DetectorPlugin,
  type FileContext,
  type ManifestFragment,
} from "@wc-toolkit/cem-generator";
import {
  getJSDocInfo,
  getNodeTypeText,
  getParsedTypeText,
  parseCemClassTags,
  resolveParsedTypeFromText,
} from "@wc-toolkit/cem-generator-utils";

export function fastPlugin(): DetectorPlugin {
  return {
    name: "fast",

    claims(sourceText) {
      return /from\s+["']@microsoft\/fast-(?:element|foundation)["']/.test(sourceText) ||
        /extends\s+(?:FASTElement|FastElement)/.test(sourceText) ||
        /@(?:customElement|attr)\b/.test(sourceText);
    },

    onFile(context: FileContext): ManifestFragment {
      const fragment: ManifestFragment = {};

      ts.forEachChild(context.sourceFile, function visit(node) {
        if (ts.isClassDeclaration(node) && node.name && extendsFastElement(node, context.checker)) {
          const className = node.name.text;
          const classDoc = parseCemClassTags(node);
          const tagName = getCustomElementTagName(node);
          const members = filterFastMembers(detectClassMembers(node, context));
          const attributes = getAttrMetadata(node, context, members);
          const classFragment: ClassFragment = {
            name: className,
            exportName: getExportName(node),
            module: context.filePath,
            description: getJSDocInfo(node).description || undefined,
            summary: classDoc.summary,
            deprecated: classDoc.deprecated,
            tagName: classDoc.tagName ?? tagName,
            superclass: { name: "FASTElement", module: "@microsoft/fast-element" },
            members,
            attributes: mergeByName(attributes, classDoc.attributes),
            slots: classDoc.slots,
            events: mergeClassEvents(
              mergeFastEvents(detectClassEvents(node, context), node, context),
              classDoc.events?.map((event) => ({
                ...event,
                parsedType: resolveParsedTypeFromText(event.type, context.sourceFile, context.checker),
              }))
            ),
            cssParts: classDoc.cssParts,
            cssProperties: classDoc.cssProperties,
            cssStates: classDoc.cssStates,
            omitInherited: classDoc.omitInherited,
            customJsDocTags: classDoc.customJsDocTags,
          };

          for (const attr of classFragment.attributes ?? []) {
            attr.parsedType ??= resolveParsedTypeFromText(attr.type, context.sourceFile, context.checker);
          }
          fragment[className] = classFragment;
        }
        ts.forEachChild(node, visit);
      });

      return fragment;
    },
  };
}

function extendsFastElement(node: ts.ClassDeclaration, checker: ts.TypeChecker): boolean {
  const heritage = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
  const seen = new Set<ts.Node>();

  function visit(expression: ts.Expression): boolean {
    if (seen.has(expression)) return false;
    seen.add(expression);
    if (ts.isIdentifier(expression) && (expression.text === "FASTElement" || expression.text === "FastElement")) return true;
    if (!ts.isIdentifier(expression)) return false;
    const symbol = checker.getSymbolAtLocation(expression);
    const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const declaration = resolved?.declarations?.find(ts.isClassDeclaration);
    const base = declaration?.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
    return !!base?.types[0] && visit(base.types[0].expression);
  }

  return !!heritage?.types.some((type) => visit(type.expression));
}

function getAttrMetadata(
  node: ts.ClassDeclaration,
  context: FileContext,
  members: ClassFragment["members"]
): ClassFragment["attributes"] {
  const byName = new Map((members ?? []).map((member) => [member.name, member]));
  const attributes: NonNullable<ClassFragment["attributes"]> = [];

  for (const member of node.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    const attrDecorator = (ts.getDecorators?.(member) ?? []).find((decorator) =>
      getDecoratorName(decorator) === "attr"
    );
    if (!attrDecorator) continue;

    const name = member.name.getText();
    const field = byName.get(name);
    if (!field || field.internal) continue;
    const options = getAttrOptions(attrDecorator);
    const attributeName = options.attribute ?? name;
    attributes.push({
      name: attributeName,
      type: getNodeTypeText(member, context.checker),
      parsedType: getParsedTypeText(member, context.checker),
      description: field.description,
      summary: field.summary,
      deprecated: field.deprecated,
      default: field.default,
      fieldName: name,
    });
    field.attribute = attributeName;
  }

  return attributes.length ? attributes : undefined;
}

function getCustomElementTagName(node: ts.ClassDeclaration): string | undefined {
  const decorator = (ts.getDecorators?.(node) ?? []).find((item) => getDecoratorName(item) === "customElement");
  if (!decorator || !ts.isCallExpression(decorator.expression)) return undefined;
  const argument = decorator.expression.arguments[0];
  if (argument && ts.isStringLiteralLike(argument)) return argument.text;
  if (!argument || !ts.isObjectLiteralExpression(argument)) return undefined;
  const name = argument.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && property.name.getText() === "name"
  )?.initializer;
  return name && ts.isStringLiteralLike(name) ? name.text : undefined;
}

function getDecoratorName(decorator: ts.Decorator): string | undefined {
  const expression = ts.isCallExpression(decorator.expression) ? decorator.expression.expression : decorator.expression;
  return ts.isIdentifier(expression) ? expression.text : undefined;
}

function getAttrOptions(decorator: ts.Decorator): { attribute?: string } {
  if (!ts.isCallExpression(decorator.expression)) return {};
  const argument = decorator.expression.arguments[0];
  if (!argument || !ts.isObjectLiteralExpression(argument)) return {};
  const attribute = argument.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && property.name.getText() === "attribute"
  )?.initializer;
  return attribute && ts.isStringLiteralLike(attribute) ? { attribute: attribute.text } : {};
}

function filterFastMembers(members: ClassFragment["members"]): ClassFragment["members"] {
  const frameworkMembers = new Set([
    "$fastController",
    "$emit",
    "connectedCallback",
    "disconnectedCallback",
    "attributeChangedCallback",
  ]);
  const filtered = members?.filter((member) => !frameworkMembers.has(member.name));
  return filtered?.length ? filtered : undefined;
}

function mergeFastEvents(
  events: ClassFragment["events"],
  node: ts.ClassDeclaration,
  context: FileContext
): ClassFragment["events"] {
  const byName = new Map((events ?? []).map((event) => [event.name, event]));

  function visit(current: ts.Node) {
    if (ts.isClassDeclaration(current)) return;
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === "$emit"
    ) {
      const name = current.arguments[0];
      if (name && ts.isStringLiteralLike(name)) {
        const detail = current.arguments[1];
        byName.set(name.text, {
          name: name.text,
          type: "CustomEvent",
          detail: detail ? getNodeTypeText(detail, context.checker) : undefined,
        });
      }
    }
    ts.forEachChild(current, visit);
  }

  ts.forEachChild(node, visit);
  return byName.size ? [...byName.values()] : undefined;
}

function getExportName(node: ts.ClassDeclaration): string | undefined {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return undefined;
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? "default" : node.name?.text;
}

function mergeByName<T extends { name: string }>(...sources: Array<T[] | undefined>): T[] | undefined {
  const merged = new Map<string, T>();
  for (const source of sources) for (const item of source ?? []) merged.set(item.name, { ...merged.get(item.name), ...item });
  return merged.size ? [...merged.values()] : undefined;
}
