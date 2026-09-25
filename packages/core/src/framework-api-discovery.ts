import ts from "@typescript/typescript6";
import type { ClassFragment } from "./types.js";
import { parseCssMetadata } from "./css-metadata.js";

export type DiscoveredFrameworkApis = Pick<
  ClassFragment,
  "events" | "slots" | "cssParts" | "cssProperties" | "cssStates"
>;

/** Discovers Web Component APIs from JSX, HTML templates, and static events. */
export function discoverFrameworkApis(
  root: ts.Node,
  sourceFile: ts.SourceFile,
  checker?: ts.TypeChecker,
): DiscoveredFrameworkApis {
  const events: NonNullable<ClassFragment["events"]> = [];
  const slots: NonNullable<ClassFragment["slots"]> = [];
  const cssParts: NonNullable<ClassFragment["cssParts"]> = [];
  const cssProperties: NonNullable<ClassFragment["cssProperties"]> = [];
  const cssStates: NonNullable<ClassFragment["cssStates"]> = [];

  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const elementName = opening.tagName.getText(sourceFile);
      if (elementName === "slot") {
        addNamed(slots, {
          name: getJsxAttributeValue(opening, "name") ?? "",
          description: getJsxLeadingComment(opening, sourceFile),
        });
      }
      for (const name of getJsxAttributeValue(opening, "part")?.split(/\s+/).filter(Boolean) ??
        []) {
        addNamed(cssParts, { name, description: getJsxLeadingComment(opening, sourceFile) });
      }
    }

    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      scanText(node.getText(sourceFile));
    }
    if (
      ts.isStringLiteral(node) &&
      /<slot\b|\bpart\s*=|:host\b|--[\w-]+|\.states\.add/.test(node.text)
    ) {
      scanText(node.text);
    }

    if (ts.isCallExpression(node)) {
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "dispatchEvent"
      ) {
        const event = node.arguments[0];
        if (
          event &&
          ts.isNewExpression(event) &&
          ts.isIdentifier(event.expression) &&
          (event.expression.text === "Event" || event.expression.text === "CustomEvent")
        ) {
          const name = getStringArgument(event.arguments?.[0]);
          if (name) addNamed(events, { name, type: event.expression.text });
        }
      }
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "$emit") {
        const name = getStringArgument(node.arguments[0]);
        if (name)
          addNamed(events, {
            name,
            type: "CustomEvent",
            detail: node.arguments[1]?.getText(sourceFile),
          });
      }
    }

    ts.forEachChild(node, visit);
  }

  function scanText(text: string) {
    for (const match of text.matchAll(/<slot\b([^>]*)>/g)) {
      const name = match[1]?.match(/\bname\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
      addNamed(slots, {
        name,
        description: getTrailingHtmlComment(text.slice(0, match.index ?? 0)),
      });
    }
    for (const match of text.matchAll(/<[^>]*\bpart\s*=\s*["']([^"']+)["'][^>]*>/g)) {
      for (const name of match[1].split(/\s+/).filter(Boolean))
        addNamed(cssParts, {
          name,
          description: getTrailingHtmlComment(text.slice(0, match.index ?? 0)),
        });
    }
    for (const property of parseCssMetadata(text) ?? []) addNamed(cssProperties, property);
    for (const match of text.matchAll(/\.states\.add\(\s*["']([^"']+)["']\s*\)/g)) {
      addNamed(cssStates, { name: match[1] });
    }
  }

  visit(root);
  if (checker) scanReferencedStyles(root, checker);
  return {
    events: events.length ? events : undefined,
    slots: slots.length ? slots : undefined,
    cssParts: cssParts.length ? cssParts : undefined,
    cssProperties: cssProperties.length ? cssProperties : undefined,
    cssStates: cssStates.length ? cssStates : undefined,
  };

  function scanReferencedStyles(styleRoot: ts.Node, typeChecker: ts.TypeChecker): void {
    function scanExpression(expression: ts.Expression, seen: Set<ts.Symbol>): void {
      if (ts.isIdentifier(expression)) {
        const symbol = typeChecker.getSymbolAtLocation(expression);
        const resolved =
          symbol && symbol.flags & ts.SymbolFlags.Alias
            ? typeChecker.getAliasedSymbol(symbol)
            : symbol;
        if (!resolved || seen.has(resolved)) return;
        seen.add(resolved);
        for (const declaration of resolved.declarations ?? []) {
          if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
            scanExpression(declaration.initializer, seen);
          }
        }
        return;
      }

      if (ts.isArrayLiteralExpression(expression)) {
        for (const element of expression.elements) {
          if (ts.isExpression(element)) scanExpression(element, seen);
        }
        return;
      }

      if (ts.isParenthesizedExpression(expression)) {
        scanExpression(expression.expression, seen);
        return;
      }

      if (ts.isTemplateExpression(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
        scanText(expression.getText(sourceFile));
      }
    }

    function visitStyles(node: ts.Node): void {
      const isStylesProperty =
        (ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) &&
        node.name.getText(sourceFile) === "styles";
      if (isStylesProperty && node.initializer) {
        scanExpression(node.initializer, new Set());
      }
      ts.forEachChild(node, visitStyles);
    }

    visitStyles(styleRoot);
  }
}

function getJsxAttributeValue(element: ts.JsxOpeningLikeElement, name: string): string | undefined {
  const attribute = element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  );
  const initializer = attribute?.initializer;
  return initializer && ts.isStringLiteral(initializer)
    ? initializer.text
    : attribute
      ? ""
      : undefined;
}

function getStringArgument(argument: ts.Expression | undefined): string | undefined {
  return argument && ts.isStringLiteralLike(argument) ? argument.text : undefined;
}

function getJsxLeadingComment(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const before = sourceFile.text.slice(0, node.getStart(sourceFile));
  const start = before.lastIndexOf("{/*");
  if (start < 0) return undefined;
  const comment = before.slice(start).match(/^\{\/\*([\s\S]*?)\*\/\}\s*$/);
  return normalizeComment(comment?.[1]);
}

function normalizeComment(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function getTrailingHtmlComment(value: string): string | undefined {
  const end = value.lastIndexOf("-->");
  if (end < 0 || value.slice(end + 3).trim()) return undefined;
  const start = value.lastIndexOf("<!--", end);
  return start >= 0 ? normalizeComment(value.slice(start + 4, end)) : undefined;
}

function addNamed<T extends { name: string }>(items: T[], item: T): void {
  const existing = items.find((value) => value.name === item.name);
  if (existing) {
    for (const [key, value] of Object.entries(item)) {
      if (value !== undefined) (existing as Record<string, unknown>)[key] = value;
    }
  } else items.push(item);
}
