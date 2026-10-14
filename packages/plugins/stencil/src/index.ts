import ts from "typescript";
import {
  detectClassMembers,
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

const STENCIL_LIFECYCLE = new Set([
  "render",
  "componentWillLoad",
  "componentDidLoad",
  "componentShouldUpdate",
  "componentWillRender",
  "componentDidRender",
  "componentWillUpdate",
  "componentDidUpdate",
  "connectedCallback",
  "disconnectedCallback",
]);

export function stencilPlugin(): DetectorPlugin {
  return {
    name: "stencil",

    shouldAnalyze(sourceText) {
      return (
        /from\s+["']@stencil\/core["']/.test(sourceText) ||
        /@(?:Component|Prop|Event)\b/.test(sourceText)
      );
    },

    onFile(context: FileContext): ManifestFragment {
      const fragment: ManifestFragment = {};

      ts.forEachChild(context.sourceFile, function visit(node) {
        if (ts.isClassDeclaration(node) && node.name && getDecorator(node, "Component")) {
          const classDoc = parseCemClassTags(node);
          const members = detectClassMembers(node, context) ?? [];
          const props = getProps(node, context, members);
          const events = getEvents(node, context);
          const discovered = discoverFrameworkApis(node, context.sourceFile, context.checker);
          const eventNames = new Set(events.map((event) => event.fieldName));
          const filteredMembers = members
            .filter((member) => !STENCIL_LIFECYCLE.has(member.name) && !eventNames.has(member.name))
            .map((member) => {
              const prop = props.find((item) => item.fieldName === member.name);
              return prop ? { ...member, attribute: prop.name, reflects: prop.reflects } : member;
            });

          const classFragment: ClassFragment = {
            name: node.name.text,
            exportName: getExportName(node),
            module: context.filePath,
            description: getJSDocInfo(node).description || undefined,
            summary: classDoc.summary,
            deprecated: classDoc.deprecated,
            tagName: classDoc.tagName ?? getComponentTagName(node),
            members: filteredMembers.length ? filteredMembers : undefined,
            attributes: props.length ? props : undefined,
            events: mergeNamed(
              discovered.events,
              events.map(({ fieldName: _fieldName, ...event }) => event),
              classDoc.events,
            ),
            slots: mergeNamed(discovered.slots, classDoc.slots),
            cssParts: mergeNamed(discovered.cssParts, classDoc.cssParts),
            cssProperties: mergeNamed(discovered.cssProperties, classDoc.cssProperties),
            cssStates: mergeNamed(discovered.cssStates, classDoc.cssStates),
            omitInherited: classDoc.omitInherited,
            customJsDocTags: classDoc.customJsDocTags,
          };

          fragment[node.name.text] = classFragment;
        }
        ts.forEachChild(node, visit);
      });

      return fragment;
    },
  };
}

function mergeNamed<T extends { name: string }>(
  ...sources: Array<T[] | undefined>
): T[] | undefined {
  const values = new Map<string, T>();
  for (const source of sources) {
    for (const item of source ?? []) values.set(item.name, { ...values.get(item.name), ...item });
  }
  return values.size ? [...values.values()] : undefined;
}

type StencilAttribute = NonNullable<ClassFragment["attributes"]>[number] & {
  fieldName: string;
  reflects?: boolean;
};

type StencilEvent = NonNullable<ClassFragment["events"]>[number] & { fieldName: string };

function getProps(
  node: ts.ClassDeclaration,
  context: FileContext,
  members: NonNullable<ClassFragment["members"]>,
): StencilAttribute[] {
  const byName = new Map(members.map((member) => [member.name, member]));
  const props: StencilAttribute[] = [];

  for (const member of node.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    const decorator = getDecorator(member, "Prop");
    if (!decorator) continue;

    const fieldName = member.name.getText();
    const field = byName.get(fieldName);
    const options = getDecoratorOptions(decorator);
    const attributeName = options.attribute ?? kebabCase(fieldName);
    props.push({
      name: attributeName,
      fieldName,
      type: getNodeTypeText(member, context.checker),
      parsedType: getParsedTypeText(member, context.checker),
      description: field?.description,
      summary: field?.summary,
      deprecated: field?.deprecated,
      default: field?.default,
      reflects: options.reflects,
    });
  }

  return props;
}

function getEvents(node: ts.ClassDeclaration, context: FileContext): StencilEvent[] {
  const events: StencilEvent[] = [];
  for (const member of node.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    const decorator = getDecorator(member, "Event");
    if (!decorator) continue;

    const fieldName = member.name.getText();
    const options = getDecoratorOptions(decorator);
    events.push({
      name: options.eventName ?? fieldName,
      fieldName,
      type: getNodeTypeText(member, context.checker),
      parsedType: getParsedTypeText(member, context.checker),
    });
  }
  return events;
}

function getDecorator(node: ts.Node, name: string): ts.Decorator | undefined {
  if (!ts.canHaveDecorators(node)) return undefined;
  return (ts.getDecorators(node) ?? []).find((decorator) => {
    const expression = ts.isCallExpression(decorator.expression)
      ? decorator.expression.expression
      : decorator.expression;
    return ts.isIdentifier(expression) && expression.text === name;
  });
}

function getDecoratorOptions(decorator: ts.Decorator): {
  attribute?: string;
  eventName?: string;
  reflects?: boolean;
} {
  if (!ts.isCallExpression(decorator.expression)) return {};
  const argument = decorator.expression.arguments[0];
  if (!argument || !ts.isObjectLiteralExpression(argument)) return {};

  const result: ReturnType<typeof getDecoratorOptions> = {};
  for (const property of argument.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name.getText();
    if (name === "attribute" && ts.isStringLiteralLike(property.initializer))
      result.attribute = property.initializer.text;
    if (name === "eventName" && ts.isStringLiteralLike(property.initializer))
      result.eventName = property.initializer.text;
    if (
      (name === "reflect" || name === "reflects") &&
      property.initializer.kind === ts.SyntaxKind.TrueKeyword
    ) {
      result.reflects = true;
    }
  }
  return result;
}

function getComponentTagName(node: ts.ClassDeclaration): string | undefined {
  const decorator = getDecorator(node, "Component");
  if (!decorator || !ts.isCallExpression(decorator.expression)) return undefined;
  const argument = decorator.expression.arguments[0];
  if (!argument || !ts.isObjectLiteralExpression(argument)) return undefined;
  const tag = argument.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && property.name.getText() === "tag",
  )?.initializer;
  return tag && ts.isStringLiteralLike(tag) ? tag.text : undefined;
}

function getExportName(node: ts.ClassDeclaration): string | undefined {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
    return undefined;
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ? "default"
    : node.name?.text;
}

function kebabCase(name: string): string {
  return name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}
