import ts from "typescript";
import postcss, { type AtRule, type Comment, type Declaration, type Node, type Rule } from "postcss";
import { getJSDocInfo, parseCemClassTags } from "@wc-toolkit/cem-generator-utils";
import type { ClassFragment, ManifestFragment } from "./types.js";

/** Extracts CEM-relevant CSS metadata from a CSS string or tagged template. */
export function parseCssMetadata(source: string): ClassFragment["cssProperties"] {
  const css = unwrapCssTemplate(source);
  let root: ReturnType<typeof postcss.parse>;
  try {
    root = postcss.parse(css);
  } catch {
    return undefined;
  }

  const byName = new Map<string, NonNullable<ClassFragment["cssProperties"]>[number]>();

  root.walkRules((rule) => {
    if (!rule.selector.includes(":host")) return;
    rule.nodes?.filter((node): node is Declaration => node.type === "decl").forEach((decl) => {
      if (!decl.prop.startsWith("--")) return;
      const description = getLeadingComment(decl);
      if (!description) return;
      byName.set(decl.prop, {
        ...byName.get(decl.prop),
        name: decl.prop,
        default: decl.value.trim() || undefined,
        description,
      });
    });
  });

  root.walkAtRules("property", (rule) => {
    const name = rule.params.trim();
    if (!name.startsWith("--")) return;
    const existing = byName.get(name);
    const syntax = findDeclaration(rule, "syntax");
    const initialValue = findDeclaration(rule, "initial-value");
    byName.set(name, {
      ...existing,
      name,
      syntax: stripCssQuotes(syntax) ?? existing?.syntax,
      default: initialValue?.trim() || existing?.default,
      description: getLeadingComment(rule) ?? existing?.description,
    });
  });

  return byName.size ? [...byName.values()] : undefined;
}

/** Finds documented CSS-only custom elements and their base custom properties. */
export function parseCssElements(source: string): ManifestFragment {
  const css = unwrapCssTemplate(source);
  let root: ReturnType<typeof postcss.parse>;
  try {
    root = postcss.parse(css);
  } catch {
    return {};
  }

  const fragment: ManifestFragment = {};
  const registeredProperties = parseRegisteredProperties(root);
  root.walkRules((rule) => {
    const comment = getLeadingJsDocComment(rule);
    if (!comment) return;
    const jsdoc = parseCssJsDoc(comment);

    for (const tagName of customElementSelectors(rule.selector)) {
      const cssProperties = mergeCssProperties(
        mergeCssProperties(parseRuleProperties(rule), registeredProperties),
        jsdoc.cssProperties
      );
      const attributes = mergeAttributes(
        collectRuleAttributes(rule),
        jsdoc.attributes
      );
      fragment[tagName] = {
        name: tagName,
        tagName,
        customElement: true,
        description: jsdoc.description,
        cssProperties,
        attributes,
      };
    }
  });

  return fragment;
}

function parseCssJsDoc(comment: string): {
  description?: string;
  cssProperties?: ClassFragment["cssProperties"];
  attributes?: ClassFragment["attributes"];
} {
  const sourceFile = ts.createSourceFile(
    "css-only-element.ts",
    `/**\n${comment}\n*/\nclass CssOnlyElement {}`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const declaration = sourceFile.statements.find(ts.isClassDeclaration);
  if (!declaration) return {};
  const info = getJSDocInfo(declaration);
  const tags = parseCemClassTags(declaration);
  return {
    description: info.description || undefined,
    cssProperties: tags.cssProperties,
    attributes: tags.attributes,
  };
}

function getLeadingJsDocComment(node: Node): string | undefined {
  const siblings = (node.parent?.nodes ?? []) as Node[];
  const previous = siblings[siblings.indexOf(node) - 1];
  if (!previous || previous.type !== "comment" || !previous.toString().trimStart().startsWith("/**")) {
    return undefined;
  }
  return normalizeComment((previous as Comment).text);
}

function parseRuleProperties(rule: Rule): ClassFragment["cssProperties"] {
  const byName = new Map<string, NonNullable<ClassFragment["cssProperties"]>[number]>();
  for (const node of rule.nodes ?? []) {
    if (node.type !== "decl" || !node.prop.startsWith("--")) continue;
    const description = getLeadingJsDocComment(node);
    if (!description) continue;
    byName.set(node.prop, {
      name: node.prop,
      default: node.value.trim() || undefined,
      description,
    });
  }
  return byName.size ? [...byName.values()] : undefined;
}

function parseRegisteredProperties(root: ReturnType<typeof postcss.parse>): ClassFragment["cssProperties"] {
  const properties: NonNullable<ClassFragment["cssProperties"]>[number][] = [];
  root.walkAtRules("property", (rule) => {
    const name = rule.params.trim();
    if (!name.startsWith("--")) return;
    const description = getLeadingJsDocComment(rule);
    const syntax = findDeclaration(rule, "syntax");
    const initialValue = findDeclaration(rule, "initial-value");
    properties.push({
      name,
      syntax: stripCssQuotes(syntax),
      default: initialValue?.trim() || undefined,
      description,
    });
  });
  return properties.length ? properties : undefined;
}

function mergeCssProperties(
  first: ClassFragment["cssProperties"],
  second: ClassFragment["cssProperties"]
): ClassFragment["cssProperties"] {
  const byName = new Map<string, NonNullable<ClassFragment["cssProperties"]>[number]>();
  for (const property of first ?? []) byName.set(property.name, property);
  for (const property of second ?? []) {
    byName.set(property.name, { ...byName.get(property.name), ...property });
  }
  return byName.size ? [...byName.values()] : undefined;
}

function collectRuleAttributes(rule: Rule): ClassFragment["attributes"] {
  const valuesByName = new Map<string, Set<string>>();

  const addFromSelector = (selector: string, nested: boolean) => {
    for (const attribute of attributeSelectors(selector, nested)) {
      const values = valuesByName.get(attribute.name) ?? new Set<string>();
      if (attribute.value !== undefined) values.add(attribute.value);
      valuesByName.set(attribute.name, values);
    }
  };

  addFromSelector(rule.selector, false);
  for (const node of rule.nodes ?? []) {
    if (node.type === "rule") addFromSelector(node.selector, true);
  }

  if (!valuesByName.size) return undefined;
  return [...valuesByName].map(([name, values]) => ({
    name,
    ...(values.size ? { type: [...values].map((value) => JSON.stringify(value)).join(" | ") } : {}),
  }));
}

function attributeSelectors(selector: string, nested: boolean): Array<{ name: string; value?: string }> {
  const trimmed = selector.trim();
  let suffix: string | undefined;

  if (nested) {
    if (!trimmed.startsWith("&")) return [];
    suffix = trimmed.slice(1);
  } else {
    const match = trimmed.match(/^[a-z][a-z0-9]*-[a-z0-9-]*/i);
    if (!match) return [];
    suffix = trimmed.slice(match[0].length);
  }

  if (!suffix?.startsWith("[")) return [];
  const attributes: Array<{ name: string; value?: string }> = [];
  let position = 0;
  while (suffix[position] === "[") {
    const end = suffix.indexOf("]", position + 1);
    if (end < 0) return [];
    const content = suffix.slice(position + 1, end);
    const match = content.match(/^\s*([a-z_:][-a-z0-9_:]*)(?:\s*=\s*(?:(["'])(.*?)\2|([^\s]+)))?\s*$/i);
    if (!match) return [];
    attributes.push({ name: match[1], value: match[3] ?? match[4] });
    position = end + 1;
  }
  return position === suffix.length ? attributes : [];
}

function mergeAttributes(
  first: ClassFragment["attributes"],
  second: ClassFragment["attributes"]
): ClassFragment["attributes"] {
  const byName = new Map<string, NonNullable<ClassFragment["attributes"]>[number]>();
  for (const attribute of first ?? []) byName.set(attribute.name, attribute);
  for (const attribute of second ?? []) {
    byName.set(attribute.name, {
      name: attribute.name,
      ...byName.get(attribute.name),
      ...Object.fromEntries(Object.entries(attribute).filter(([, value]) => value !== undefined)),
    });
  }
  return byName.size ? [...byName.values()] : undefined;
}

function customElementSelectors(selector: string): string[] {
  const tags = new Set<string>();
  for (const part of selector.split(",")) {
    const match = part.trim().match(/^([a-z][a-z0-9]*-[a-z0-9-]*)(?=$|[.#:[>+~\s])/i);
    if (match) tags.add(match[1].toLowerCase());
  }
  return [...tags];
}

function unwrapCssTemplate(source: string): string {
  const firstBacktick = source.indexOf("`");
  const lastBacktick = source.lastIndexOf("`");
  const template = firstBacktick >= 0 && lastBacktick > firstBacktick
    ? source.slice(firstBacktick + 1, lastBacktick)
    : source;
  const styleBlocks = [...template.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)];
  if (styleBlocks.length) return styleBlocks.map((match) => match[1] ?? "").join("\n");
  return template;
}

function findDeclaration(rule: AtRule, name: string): string | undefined {
  const declaration = rule.nodes?.find(
    (node): node is Declaration => node.type === "decl" && node.prop === name
  );
  return declaration?.value;
}

function getLeadingComment(node: Node): string | undefined {
  const siblings = (node.parent?.nodes ?? []) as Node[];
  const index = siblings.indexOf(node);
  const previous = index > 0 ? siblings[index - 1] : undefined;
  if (!previous || previous.type !== "comment") return undefined;
  return normalizeComment((previous as Comment).text);
}

function normalizeComment(value: string): string | undefined {
  const text = value
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, ""))
    .join("\n")
    .trim();
  return text || undefined;
}

function stripCssQuotes(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
