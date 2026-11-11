import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  detectClassEvents,
  detectClassMembers,
  mergeClassEvents,
  type ClassFragment,
  type DetectorPlugin,
  type FileContext,
  type ManifestFragment,
} from "@wc-toolkit/cem-generator";
import {
  getJSDocInfo,
  inheritsFrom,
  parseCemClassTags,
  resolveMeaningfulParsedTypeFromText,
} from "@wc-toolkit/cem-generator-utils";

export interface LwcPluginOptions {
  /** Namespace prefix for bundle tag names. Defaults to `c`. */
  namespace?: string;
}

interface ApiNames {
  properties: Set<string>;
  methods: Set<string>;
}

export function lwcPlugin(options: LwcPluginOptions = {}): DetectorPlugin {
  const namespace = options.namespace ?? "c";

  return {
    name: "lwc",

    shouldAnalyze(sourceText) {
      return (
        /from\s+["']lwc["']/.test(sourceText) || /extends\s+LightningElement\b/.test(sourceText)
      );
    },

    onFile(context: FileContext): ManifestFragment {
      const fragment: ManifestFragment = {};

      ts.forEachChild(context.sourceFile, function visit(node) {
        if (
          ts.isClassDeclaration(node) &&
          node.name &&
          extendsLightningElement(node, context.checker)
        ) {
          const className = node.name.text;
          const exportName = getExportName(node);
          const classDoc = parseCemClassTags(node);
          const isBundleEntry = exportName === "default" && isBundleEntryFile(context.filePath);
          const apiNames = getApiNames(node);
          const members = detectClassMembers(node, context)?.filter(
            (member) => apiNames.properties.has(member.name) || apiNames.methods.has(member.name),
          );
          const attributes = getAttributes(members, apiNames.properties);
          const tagName =
            classDoc.tagName ??
            (isBundleEntry ? getBundleTagName(context.filePath, namespace) : undefined);
          const classFragment: ClassFragment = {
            name: className,
            exportName,
            module: context.filePath,
            description: getJSDocInfo(node).description || undefined,
            summary: classDoc.summary,
            deprecated: classDoc.deprecated,
            customElement: tagName !== undefined,
            tagName,
            superclass: getLwcSuperclass(node, context.checker),
            members: members?.length ? members : undefined,
            attributes: mergeByName(attributes, classDoc.attributes),
            slots: mergeByName(
              isBundleEntry ? getTemplateSlots(context.filePath) : undefined,
              classDoc.slots,
            ),
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
            cssParts: classDoc.cssParts,
            cssProperties: classDoc.cssProperties,
            cssStates: classDoc.cssStates,
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
        ts.forEachChild(node, visit);
      });

      return fragment;
    },
  };
}

function getApiNames(node: ts.ClassDeclaration): ApiNames {
  const names: ApiNames = { properties: new Set(), methods: new Set() };

  for (const member of node.members) {
    if (!member.name || !hasApiDecorator(member)) continue;
    const name = member.name.getText();
    if (ts.isMethodDeclaration(member)) names.methods.add(name);
    else if (
      ts.isPropertyDeclaration(member) ||
      ts.isGetAccessorDeclaration(member) ||
      ts.isSetAccessorDeclaration(member)
    )
      names.properties.add(name);
  }

  return names;
}

function hasApiDecorator(member: ts.ClassElement): boolean {
  const decorators = ts.canHaveDecorators(member) ? ts.getDecorators(member) : undefined;
  return (decorators ?? []).some((decorator) => getDecoratorName(decorator) === "api");
}

function getAttributes(
  members: ClassFragment["members"],
  propertyNames: Set<string>,
): ClassFragment["attributes"] {
  const attributes: NonNullable<ClassFragment["attributes"]> = [];

  for (const member of members ?? []) {
    if (!propertyNames.has(member.name)) continue;
    const attributeName =
      typeof member.attribute === "string" ? member.attribute : toKebabCase(member.name);
    member.attribute = attributeName;
    attributes.push({
      name: attributeName,
      type: member.type,
      parsedType: member.parsedType,
      description: member.description,
      summary: member.summary,
      deprecated: member.deprecated,
      default: member.default,
      fieldName: member.name,
    });
  }

  return attributes.length ? attributes : undefined;
}

function getBundleTagName(filePath: string, namespace: string): string {
  return `${namespace}-${toKebabCase(path.basename(path.dirname(filePath)))}`;
}

function isBundleEntryFile(filePath: string): boolean {
  return path.basename(filePath, path.extname(filePath)) === path.basename(path.dirname(filePath));
}

function getTemplateSlots(filePath: string): ClassFragment["slots"] {
  const bundleName = path.basename(path.dirname(filePath));
  const templatePath = path.join(path.dirname(filePath), `${bundleName}.html`);
  if (!fs.existsSync(templatePath)) return undefined;

  const template = fs.readFileSync(templatePath, "utf-8");
  const slots: NonNullable<ClassFragment["slots"]> = [];
  for (const match of template.matchAll(/<slot(?=[\s/>])([^>]*)>/g)) {
    const name = match[1].match(/\bname\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
    const description = getTrailingHtmlComment(template.slice(0, match.index ?? 0));
    slots.push(description ? { name, description } : { name });
  }

  return slots.length ? slots : undefined;
}

function getTrailingHtmlComment(value: string): string | undefined {
  const end = value.lastIndexOf("-->");
  if (end < 0 || value.slice(end + 3).trim()) return undefined;
  const start = value.lastIndexOf("<!--", end);
  if (start < 0) return undefined;
  return (
    value
      .slice(start + 4, end)
      .replace(/\s+/g, " ")
      .trim() || undefined
  );
}

function getLwcSuperclass(
  node: ts.ClassDeclaration,
  checker: ts.TypeChecker,
): { name: string; module?: string } {
  const expression = getBaseExpression(node);
  if (!expression || !ts.isIdentifier(expression) || expression.text === "LightningElement") {
    return { name: "LightningElement", module: "lwc" };
  }

  const declaration = resolveClassDeclaration(expression, checker);
  if (!declaration?.name) return { name: expression.text };

  return { name: declaration.name.text, module: declaration.getSourceFile().fileName };
}

function extendsLightningElement(node: ts.ClassDeclaration, checker: ts.TypeChecker): boolean {
  return inheritsFrom(
    node,
    checker,
    ({ expression }) => ts.isIdentifier(expression) && expression.text === "LightningElement",
  );
}

function getBaseExpression(node: ts.ClassDeclaration): ts.Expression | undefined {
  const heritage = node.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
  );
  return heritage?.types[0]?.expression;
}

function resolveClassDeclaration(
  expression: ts.Identifier,
  checker: ts.TypeChecker,
): ts.ClassDeclaration | undefined {
  const symbol = checker.getSymbolAtLocation(expression);
  const resolved =
    symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return resolved?.declarations?.find(ts.isClassDeclaration);
}

function getDecoratorName(decorator: ts.Decorator): string | undefined {
  const expression = ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression;
  return ts.isIdentifier(expression) ? expression.text : undefined;
}

function getExportName(node: ts.ClassDeclaration): string | undefined {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
    return undefined;
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ? "default"
    : node.name?.text;
}

function toKebabCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function mergeByName<T extends { name: string }>(
  ...sources: Array<T[] | undefined>
): T[] | undefined {
  const merged = new Map<string, T>();
  for (const source of sources)
    for (const item of source ?? []) merged.set(item.name, { ...merged.get(item.name), ...item });
  return merged.size ? [...merged.values()] : undefined;
}
