import ts from "@typescript/typescript6";
import postcss, {
  type AtRule,
  type Comment,
  type Declaration,
  type Node,
  type Rule,
} from "postcss";
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
    rule.nodes
      ?.filter((node): node is Declaration => node.type === "decl")
      .forEach((decl) => {
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
const CSS_ONLY_SUPERCLASS = { name: "HTMLUnknownElement" } as const;

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
    const slots = mergeSlots(collectRuleSlots(rule), jsdoc.slots);

    for (const tagName of customElementSelectors(rule.selector)) {
      addCssElement(fragment, tagName, {
        name: tagName,
        tagName,
        customElement: true,
        superclass: CSS_ONLY_SUPERCLASS,
        description: jsdoc.description,
        cssProperties: mergeCssProperties(
          mergeCssProperties(parseRuleProperties(rule), registeredProperties),
          jsdoc.cssProperties,
        ),
        attributes: mergeAttributes(collectRuleAttributes(rule), jsdoc.attributes),
        slots,
      });
    }
  });

  root.walkAtRules("scope", (atRule) => {
    const comment = getLeadingJsDocComment(atRule);
    if (!comment) return;
    const jsdoc = parseCssJsDoc(comment);
    const rootSelector = scopeRootSelector(atRule.params);

    for (const tagName of customElementSelectors(rootSelector)) {
      addCssElement(fragment, tagName, {
        name: tagName,
        tagName,
        customElement: true,
        superclass: CSS_ONLY_SUPERCLASS,
        description: jsdoc.description,
        cssProperties: jsdoc.cssProperties,
        attributes: jsdoc.attributes,
        slots: jsdoc.slots,
      });
    }
  });

  return fragment;
}

/** Merges a rule's findings into any data already recorded for the same tag. */
function addCssElement(fragment: ManifestFragment, tagName: string, incoming: ClassFragment): void {
  const existing = fragment[tagName];
  if (!existing) {
    fragment[tagName] = incoming;
    return;
  }

  fragment[tagName] = {
    ...incoming,
    ...existing,
    name: tagName,
    tagName,
    customElement: true,
    description: existing.description ?? incoming.description,
    cssProperties: mergeCssProperties(existing.cssProperties, incoming.cssProperties),
    attributes: mergeAttributes(existing.attributes, incoming.attributes),
    slots: mergeSlots(existing.slots, incoming.slots),
  };
}

function parseCssJsDoc(comment: string): {
  description?: string;
  cssProperties?: ClassFragment["cssProperties"];
  attributes?: ClassFragment["attributes"];
  slots?: ClassFragment["slots"];
} {
  const sourceFile = ts.createSourceFile(
    "css-only-element.ts",
    `/**\n${comment}\n*/\nclass CssOnlyElement {}`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = sourceFile.statements.find(ts.isClassDeclaration);
  if (!declaration) return {};
  const info = getJSDocInfo(declaration);
  const tags = parseCemClassTags(declaration);
  return {
    description: info.description || undefined,
    cssProperties: tags.cssProperties,
    attributes: tags.attributes,
    slots: tags.slots,
  };
}

function getLeadingJsDocComment(node: Node): string | undefined {
  const siblings = (node.parent?.nodes ?? []) as Node[];
  const previous = siblings[siblings.indexOf(node) - 1];
  if (
    !previous ||
    previous.type !== "comment" ||
    !previous.toString().trimStart().startsWith("/**")
  ) {
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

function parseRegisteredProperties(
  root: ReturnType<typeof postcss.parse>,
): ClassFragment["cssProperties"] {
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
  second: ClassFragment["cssProperties"],
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

function attributeSelectors(
  selector: string,
  nested: boolean,
): Array<{ name: string; value?: string }> {
  const trimmed = selector.trim();
  let suffix: string | undefined;

  if (nested) {
    if (!trimmed.startsWith("&")) return [];
    suffix = trimmed.slice(1);
  } else {
    const match = trimmed.match(/^[a-z][a-z0-9]*-[a-z0-9-]*/i);
    if (match) {
      suffix = trimmed.slice(match[0].length);
    } else {
      const pseudo = trimmed.match(/^:(?:is|where|matches)\(/i);
      if (!pseudo) return [];
      const close = matchingParen(trimmed, pseudo[0].length - 1);
      if (close < 0) return [];
      suffix = trimmed.slice(close + 1);
    }
  }

  if (!suffix?.startsWith("[")) return [];
  const attributes: Array<{ name: string; value?: string }> = [];
  let position = 0;
  while (suffix[position] === "[") {
    const end = suffix.indexOf("]", position + 1);
    if (end < 0) return [];
    const content = suffix.slice(position + 1, end);
    const match = content.match(
      /^\s*([a-z_:][-a-z0-9_:]*)(?:\s*=\s*(?:(["'])(.*?)\2|([^\s]+)))?\s*$/i,
    );
    if (!match) return [];
    attributes.push({ name: match[1], value: match[3] ?? match[4] });
    position = end + 1;
  }
  return position === suffix.length ? attributes : [];
}

function mergeAttributes(
  first: ClassFragment["attributes"],
  second: ClassFragment["attributes"],
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

/**
 * Finds the custom-element tag names a selector targets, including names nested
 * in `:is()`/`:where()` functions and selector lists.
 */
function customElementSelectors(selector: string): string[] {
  const tags = new Set<string>();
  for (const complex of splitTopLevel(selector, (char) => char === ",")) {
    for (const compound of splitCompounds(complex)) {
      for (const tag of tagsInCompound(compound)) tags.add(tag);
    }
  }
  return [...tags];
}

function tagsInCompound(compound: string): string[] {
  const tags: string[] = [];
  const match = compound.match(/^([a-z][a-z0-9]*-[a-z0-9-]*)/i);
  if (match) tags.push(match[1].toLowerCase());

  for (const args of functionalPseudoArgs(compound)) {
    tags.push(...customElementSelectors(args));
  }
  return tags;
}

/** Extracts the arguments of `:is()`/`:where()`/`:matches()` functions in a compound. */
function functionalPseudoArgs(compound: string): string[] {
  const args: string[] = [];
  for (let index = 0; index < compound.length; index += 1) {
    if (compound[index] !== ":" || compound[index - 1] === "\\") continue;
    const match = compound.slice(index + 1).match(/^(is|where|matches|-webkit-any|-moz-any)\(/i);
    if (!match) continue;
    const open = index + match[0].length;
    const close = matchingParen(compound, open);
    if (close < 0) continue;
    args.push(compound.slice(open + 1, close));
    index = close;
  }
  return args;
}

/** Returns the index of the `)` matching the `(` at `open`, or -1. */
function matchingParen(text: string, open: number): number {
  let depth = 0;
  let quote: string | undefined;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")" && --depth === 0) return index;
  }
  return -1;
}

/** Splits `text` on a separator character at the top level, ignoring brackets/quotes. */
function splitTopLevel(text: string, isSeparator: (char: string) => boolean): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | undefined;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      current += char;
      if (char === quote && text[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === ")" || char === "]") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }
    if (depth === 0 && isSeparator(char)) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** Splits a complex selector into its compound selectors (around combinators). */
function splitCompounds(complex: string): string[] {
  return splitTopLevel(complex, (char) => /[\s>+~]/.test(char));
}

/** Reads the selector that anchors an `@scope` at-rule, before its scope limit. */
function scopeRootSelector(params: string): string {
  const trimmed = params.trim();
  const toIndex = findScopeLimit(trimmed);
  const root = toIndex >= 0 ? trimmed.slice(0, toIndex).trim() : trimmed;
  if (root.startsWith("(") && matchingParen(root, 0) === root.length - 1) {
    return root.slice(1, -1).trim();
  }
  return root;
}

function findScopeLimit(params: string): number {
  let depth = 0;
  let quote: string | undefined;
  for (let index = 0; index < params.length; index += 1) {
    const char = params[index];
    if (quote) {
      if (char === quote && params[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    if (depth === 0 && params.startsWith(" to ", index)) return index;
  }
  return -1;
}

/** Discovers slot names referenced by `slot="..."` selectors in a rule and its nested rules. */
function collectRuleSlots(rule: Rule): ClassFragment["slots"] {
  const byName = new Map<string, NonNullable<ClassFragment["slots"]>[number]>();
  const selectors = [rule.selector];
  rule.walkRules((nested) => {
    selectors.push(nested.selector);
  });

  for (const selector of selectors) {
    for (const name of slotNamesInSelector(selector)) {
      if (!byName.has(name)) byName.set(name, { name });
    }
  }
  return byName.size ? [...byName.values()] : undefined;
}

function slotNamesInSelector(selector: string): string[] {
  const names: string[] = [];
  const matches = selector.matchAll(/\[\s*slot\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*\]/gi);
  for (const match of matches) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name) names.push(name);
  }
  return names;
}

function mergeSlots(
  first: ClassFragment["slots"],
  second: ClassFragment["slots"],
): ClassFragment["slots"] {
  if (!first && !second) return undefined;
  const byName = new Map<string, NonNullable<ClassFragment["slots"]>[number]>();
  for (const slot of first ?? []) byName.set(slot.name, slot);
  for (const slot of second ?? []) {
    byName.set(slot.name, {
      name: slot.name,
      ...byName.get(slot.name),
      ...Object.fromEntries(Object.entries(slot).filter(([, value]) => value !== undefined)),
    });
  }
  return byName.size ? [...byName.values()] : undefined;
}

function unwrapCssTemplate(source: string): string {
  const firstBacktick = source.indexOf("`");
  const lastBacktick = source.lastIndexOf("`");
  const template =
    firstBacktick >= 0 && lastBacktick > firstBacktick
      ? source.slice(firstBacktick + 1, lastBacktick)
      : source;
  const styleBlocks = [...template.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)];
  if (styleBlocks.length) return styleBlocks.map((match) => match[1] ?? "").join("\n");
  return template;
}

function findDeclaration(rule: AtRule, name: string): string | undefined {
  const declaration = rule.nodes?.find(
    (node): node is Declaration => node.type === "decl" && node.prop === name,
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
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
