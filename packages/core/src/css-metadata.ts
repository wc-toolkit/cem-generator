import postcss, { type AtRule, type Comment, type Declaration, type Node, type Rule } from "postcss";
import type { ClassFragment } from "./types.js";

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
    rule.walkDecls((decl) => {
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
