import * as ts from "typescript/ast";
import {
  symbolDeclarations,
  getModifiers,
  getDecorators,
  getJSDocInfo,
  getNodeTypeText,
  getParsedTypeText,
  inheritsFrom,
  parseCemClassTags,
  resolveMeaningfulParsedTypeFromText,
} from "@wc-toolkit/cem-generator-utils";
import { SymbolFlags } from "typescript/sync";
import * as is from "typescript/ast/is";
import type { Checker } from "typescript/sync";
import {
  detectClassMembers,
  detectClassEvents,
  mergeClassEvents,
  discoverFrameworkApis,
  type ClassFragment,
  type DetectorPlugin,
  type FileContext,
  type ManifestFragment,
} from "@wc-toolkit/cem-generator";

export function fastPlugin(): DetectorPlugin {
  return {
    name: "fast",

    shouldAnalyze(sourceText) {
      return (
        /from\s+["']@microsoft\/fast-(?:element|foundation)["']/.test(sourceText) ||
        /extends\s+(?:FASTElement|FastElement)/.test(sourceText) ||
        /@(?:customElement|attr)\b/.test(sourceText)
      );
    },

    onFile(context: FileContext): ManifestFragment {
      const fragment: ManifestFragment = {};

      context.sourceFile.forEachChild(function visit(node) {
        if (is.isClassDeclaration(node) && node.name && extendsFastElement(node, context.checker)) {
          const className = node.name.text;
          const classDoc = parseCemClassTags(node);
          const tagName = getCustomElementTagName(node);
          const members = filterFastMembers(detectClassMembers(node, context));
          const attributes = getAttrMetadata(node, context, members);
          const discovered = discoverFrameworkApis(node, context.sourceFile, context.checker);
          const classFragment: ClassFragment = {
            name: className,
            exportName: getExportName(node),
            module: context.filePath,
            description: getJSDocInfo(node).description || undefined,
            summary: classDoc.summary,
            deprecated: classDoc.deprecated,
            tagName: classDoc.tagName ?? tagName,
            superclass: getFastSuperclass(node, context.checker),
            members,
            attributes: mergeByName(attributes, classDoc.attributes),
            slots: mergeByName(discovered.slots, classDoc.slots),
            events: mergeClassEvents(
              mergeFastEvents(
                mergeClassEvents(discovered.events, detectClassEvents(node, context)),
                node,
                context,
              ),
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
            cssParts: mergeByName(discovered.cssParts, classDoc.cssParts),
            cssProperties: mergeByName(discovered.cssProperties, classDoc.cssProperties),
            cssStates: mergeByName(discovered.cssStates, classDoc.cssStates),
            omitInherited: classDoc.omitInherited,
            customJsDocTags: classDoc.customJsDocTags,
          };

          for (const attr of classFragment.attributes ?? []) {
            if (context.typeParsing !== "none") {
              attr.parsedType ??= resolveMeaningfulParsedTypeFromText(
                attr.type,
                context.sourceFile,
                context.checker,
              );
            }
          }
          fragment[className] = classFragment;
        }
        node.forEachChild(visit);
      });

      return fragment;
    },
  };
}

function getFastSuperclass(
  node: ts.ClassDeclaration,
  checker: Checker,
): { name: string; module?: string } {
  const heritage = node.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const expression = (heritage?.types[0] as ts.ExpressionWithTypeArguments)?.expression;
  if (!expression || !is.isIdentifier(expression)) {
    return { name: "FASTElement", module: "@microsoft/fast-element" };
  }

  const name = expression.text;
  if (name === "FASTElement" || name === "FastElement") {
    return { name: "FASTElement", module: "@microsoft/fast-element" };
  }

  const symbol = checker.getSymbolAtLocation(expression);
  const resolved =
    symbol && symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const declaration = symbolDeclarations(resolved, [ts.SyntaxKind.ClassDeclaration]).find(
    is.isClassDeclaration,
  );
  if (!declaration?.name) return { name, module: "@microsoft/fast-element" };

  return { name: declaration.name.text, module: declaration.getSourceFile().fileName };
}

function extendsFastElement(node: ts.ClassDeclaration, checker: Checker): boolean {
  return inheritsFrom(
    node,
    checker,
    ({ expression }) =>
      is.isIdentifier(expression) &&
      (expression.text === "FASTElement" || expression.text === "FastElement"),
  );
}

function getAttrMetadata(
  node: ts.ClassDeclaration,
  context: FileContext,
  members: ClassFragment["members"],
): ClassFragment["attributes"] {
  const byName = new Map((members ?? []).map((member) => [member.name, member]));
  const attributes: NonNullable<ClassFragment["attributes"]> = [];

  for (const member of node.members) {
    if (!is.isPropertyDeclaration(member)) continue;
    const attrDecorator = (getDecorators(member) ?? []).find(
      (decorator) => getDecoratorName(decorator) === "attr",
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
  const decorator = (getDecorators(node) ?? []).find(
    (item) => getDecoratorName(item) === "customElement",
  );
  if (!decorator || !is.isCallExpression(decorator.expression)) return undefined;
  const argument = decorator.expression.arguments[0];
  if (argument && is.isStringLiteralLikeNode(argument)) return argument.text;
  if (!argument || !is.isObjectLiteralExpression(argument)) return undefined;
  const name = argument.properties.find(
    (property): property is ts.PropertyAssignment =>
      is.isPropertyAssignment(property) && property.name.getText() === "name",
  )?.initializer;
  return name && is.isStringLiteralLikeNode(name) ? name.text : undefined;
}

function getDecoratorName(decorator: ts.Decorator): string | undefined {
  const expression = is.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression;
  return is.isIdentifier(expression) ? expression.text : undefined;
}

function getAttrOptions(decorator: ts.Decorator): { attribute?: string } {
  if (!is.isCallExpression(decorator.expression)) return {};
  const argument = decorator.expression.arguments[0];
  if (!argument || !is.isObjectLiteralExpression(argument)) return {};
  const attribute = argument.properties.find(
    (property): property is ts.PropertyAssignment =>
      is.isPropertyAssignment(property) && property.name.getText() === "attribute",
  )?.initializer;
  return attribute && is.isStringLiteralLikeNode(attribute) ? { attribute: attribute.text } : {};
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
  context: FileContext,
): ClassFragment["events"] {
  const byName = new Map((events ?? []).map((event) => [event.name, event]));

  function visit(current: ts.Node) {
    if (is.isClassDeclaration(current)) return;
    if (
      is.isCallExpression(current) &&
      is.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === "$emit"
    ) {
      const name = current.arguments[0];
      if (name && is.isStringLiteralLikeNode(name)) {
        const detail = current.arguments[1];
        byName.set(name.text, {
          name: name.text,
          type: "CustomEvent",
          detail: detail ? getNodeTypeText(detail, context.checker) : undefined,
        });
      }
    }
    current.forEachChild(visit);
  }

  node.forEachChild(visit);
  return byName.size ? [...byName.values()] : undefined;
}

function getExportName(node: ts.ClassDeclaration): string | undefined {
  const modifiers = getModifiers(node);
  if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
    return undefined;
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ? "default"
    : node.name?.text;
}

function mergeByName<T extends { name: string }>(
  ...sources: Array<T[] | undefined>
): T[] | undefined {
  const merged = new Map<string, T>();
  for (const source of sources)
    for (const item of source ?? []) merged.set(item.name, { ...merged.get(item.name), ...item });
  return merged.size ? [...merged.values()] : undefined;
}
