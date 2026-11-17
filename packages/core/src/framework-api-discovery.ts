import * as ts from "typescript/ast";
import { symbolDeclarations } from "@wc-toolkit/cem-generator-utils";
import { SymbolFlags } from "typescript/sync";
import * as is from "typescript/ast/is";
import type { Checker, Symbol as TsSymbol } from "typescript/sync";
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
  checker?: Checker,
): DiscoveredFrameworkApis {
  const events: NonNullable<ClassFragment["events"]> = [];
  const slots: NonNullable<ClassFragment["slots"]> = [];
  const cssParts: NonNullable<ClassFragment["cssParts"]> = [];
  const cssProperties: NonNullable<ClassFragment["cssProperties"]> = [];
  const cssStates: NonNullable<ClassFragment["cssStates"]> = [];

  function visit(node: ts.Node) {
    if (is.isJsxElement(node) || is.isJsxSelfClosingElement(node)) {
      const opening = is.isJsxElement(node) ? node.openingElement : node;
      const elementName = opening.tagName.getText(sourceFile);
      if (elementName === "slot") {
        addNamed(slots, {
          name: getJsxAttributeValue(opening, "name") ?? "",
          description: getJsxLeadingComment(opening, sourceFile),
        });
      }
      for (const name of getJsxAttributeValue(opening, "part")?.split(/\s+/).filter(Boolean) ??
        []) {
        if (!name.includes("${")) {
          addNamed(cssParts, { name, description: getJsxLeadingComment(opening, sourceFile) });
        }
      }
    }

    if (is.isTemplateExpression(node) || is.isNoSubstitutionTemplateLiteral(node)) {
      scanText(node.getText(sourceFile));
    }
    if (
      is.isStringLiteral(node) &&
      /<slot\b|\bpart\s*=|:host\b|--[\w-]+|\.states\.add/.test(node.text)
    ) {
      scanText(node.text);
    }

    if (is.isCallExpression(node)) {
      if (
        is.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "dispatchEvent"
      ) {
        const event = node.arguments[0];
        if (
          event &&
          is.isNewExpression(event) &&
          is.isIdentifier(event.expression) &&
          (event.expression.text === "Event" || event.expression.text === "CustomEvent")
        ) {
          const name = getStringArgument(event.arguments?.[0]);
          if (name) addNamed(events, { name, type: event.expression.text });
        }
      }
      if (is.isPropertyAccessExpression(node.expression) && node.expression.name.text === "$emit") {
        const name = getStringArgument(node.arguments[0]);
        if (name)
          addNamed(events, {
            name,
            type: "CustomEvent",
            detail: node.arguments[1]?.getText(sourceFile),
          });
      }
    }

    node.forEachChild(visit);
  }

  function scanText(text: string) {
    for (const match of text.matchAll(/<slot\b([^>]*)>/g)) {
      const name = match[1]?.match(/\bname\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
      if (!name.includes("${")) {
        addNamed(slots, {
          name,
          description: getTrailingHtmlComment(text.slice(0, match.index ?? 0)),
        });
      }
    }
    for (const match of text.matchAll(/<[^>]*\bpart\s*=\s*["']([^"']+)["'][^>]*>/g)) {
      for (const name of match[1].split(/\s+/).filter(Boolean))
        if (!name.includes("${")) {
          addNamed(cssParts, {
            name,
            description: getTrailingHtmlComment(text.slice(0, match.index ?? 0)),
          });
        }
    }
    for (const property of parseCssMetadata(text) ?? []) addNamed(cssProperties, property);
    for (const match of text.matchAll(/\.states\.add\(\s*["']([^"']+)["']\s*\)/g)) {
      if (!match[1].includes("${")) addNamed(cssStates, { name: match[1] });
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

  function scanReferencedStyles(styleRoot: ts.Node, typeChecker: Checker): void {
    function scanExpression(expression: ts.Expression, seen: Set<TsSymbol>): void {
      if (is.isIdentifier(expression)) {
        const symbol = typeChecker.getSymbolAtLocation(expression);
        const resolved =
          symbol && symbol.flags & SymbolFlags.Alias
            ? typeChecker.getAliasedSymbol(symbol)
            : symbol;
        if (!resolved || seen.has(resolved)) return;
        seen.add(resolved);
        for (const declaration of symbolDeclarations(resolved, [
          ts.SyntaxKind.VariableDeclaration,
        ])) {
          if (is.isVariableDeclaration(declaration) && declaration.initializer) {
            scanExpression(declaration.initializer, seen);
          }
        }
        return;
      }

      if (is.isArrayLiteralExpression(expression)) {
        for (const element of expression.elements) {
          if (is.isExpression(element)) scanExpression(element, seen);
        }
        return;
      }

      if (is.isParenthesizedExpression(expression)) {
        scanExpression(expression.expression, seen);
        return;
      }

      if (is.isTemplateExpression(expression) || is.isNoSubstitutionTemplateLiteral(expression)) {
        scanText(expression.getText(sourceFile));
      }
    }

    function visitStyles(node: ts.Node): void {
      const isStylesProperty =
        (is.isPropertyDeclaration(node) || is.isPropertyAssignment(node)) &&
        node.name.getText(sourceFile) === "styles";
      if (isStylesProperty && node.initializer) {
        scanExpression(node.initializer, new Set());
      }
      node.forEachChild(visitStyles);
    }

    visitStyles(styleRoot);
  }
}

function getJsxAttributeValue(element: ts.JsxOpeningLikeElement, name: string): string | undefined {
  const attribute = element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      is.isJsxAttribute(property) && is.isIdentifier(property.name) && property.name.text === name,
  );
  const initializer = attribute?.initializer;
  return initializer && is.isStringLiteral(initializer)
    ? initializer.text
    : attribute
      ? ""
      : undefined;
}

function getStringArgument(argument: ts.Expression | undefined): string | undefined {
  return argument && is.isStringLiteralLikeNode(argument) ? argument.text : undefined;
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
